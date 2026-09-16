import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ObjectDetails, ObjectSummary, LngLat, Paginated } from '@oks/shared';
import { PrismaService } from '../../common/prisma.service';
import { normalizePagination, paginated } from '../../common/pagination';
import type { ListObjectsDto } from './dto/list-objects.dto';

/** Include-наборы и соответствующие типы строк Prisma (без `any`). */
const LIST_INCLUDE = {
  industry: true,
  status: true,
  municipality: true,
  capacityUnit: true,
  _count: { select: { mediaAssets: true, cameraSources: true } },
} satisfies Prisma.ObjectInclude;
type ListRow = Prisma.ObjectGetPayload<{ include: typeof LIST_INCLUDE }>;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  _count: { select: { mediaAssets: true, cameraSources: true, appeals: true } },
  grbs: true,
  customer: true,
  contractor: true,
  programNp: true,
  programFp: true,
  contracts: true,
  cameraSources: true,
} satisfies Prisma.ObjectInclude;
type DetailRow = Prisma.ObjectGetPayload<{ include: typeof DETAIL_INCLUDE }>;

interface GeomRow {
  id: string;
  geom_json: string | null;
  display_json: string | null;
  approx: boolean;
}

function coordsFromGeoJson(json: string | null): LngLat | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { type: string; coordinates: number[] };
    if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
      return [parsed.coordinates[0], parsed.coordinates[1]];
    }
  } catch {
    return null;
  }
  return null;
}

function toNum(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Number.isFinite(n) ? n : null;
}

function isoDate(v: Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function ownershipLabel(v: string): string {
  if (v === 'state') return 'Государственная';
  if (v === 'municipal') return 'Муниципальная';
  return 'Не указана';
}

/** Строка экспорта (CSV/XLSX/GeoJSON) — человекочитаемые колонки. */
export interface ExportRow {
  extId: string;
  name: string;
  industryName: string;
  statusName: string;
  statusGroup: string;
  ownership: string;
  municipalityName: string;
  address: string;
  lon: number | null;
  lat: number | null;
  locationApproximate: boolean;
  readinessPct: number | null;
  areaM2: number | null;
  capacityValue: number | null;
  capacityUnit: string;
  yearStart: number | null;
  yearEnd: number | null;
  commissioningYear: number | null;
  customer: string;
  contractor: string;
}

@Injectable()
export class ObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** id объектов в bbox (GiST). null — если bbox не задан/некорректен. */
  private async idsInBbox(bbox: string): Promise<string[] | null> {
    const parts = bbox.split(',').map((s) => Number.parseFloat(s.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM objects
      WHERE geom IS NOT NULL
        AND ST_Intersects(geom, ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326))
    `;
    return rows.map((r) => r.id);
  }

  /** id объектов в радиусе от точки («рядом со мной», ST_DWithin по geography). */
  private async idsNear(near: string): Promise<string[] | null> {
    const parts = near.split(',').map((s) => Number.parseFloat(s.trim()));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [lon, lat, radiusM] = parts as [number, number, number];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM objects
      WHERE geom IS NOT NULL
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radiusM})
    `;
    return rows.map((r) => r.id);
  }

  /** Пересечение двух наборов id (null = «без ограничения»). */
  private intersectIds(a: string[] | null, b: string[] | null): string[] | null {
    if (a === null) return b;
    if (b === null) return a;
    const setB = new Set(b);
    return a.filter((id) => setB.has(id));
  }

  private buildWhere(dto: ListObjectsDto, spatialIds: string[] | null): Prisma.ObjectWhereInput {
    const AND: Prisma.ObjectWhereInput[] = [];
    if (dto.industry?.length) AND.push({ industry: { code: { in: dto.industry } } });
    if (dto.status?.length) AND.push({ status: { code: { in: dto.status } } });
    if (dto.statusGroup?.length) AND.push({ status: { groupCode: { in: dto.statusGroup } } });
    if (dto.municipality?.length) AND.push({ municipalityId: { in: dto.municipality } });
    if (dto.ownership?.length) AND.push({ ownership: { in: dto.ownership } });
    if (dto.customer?.length) AND.push({ customer: { nameNormalized: { in: dto.customer } } });
    if (dto.contractor?.length) AND.push({ contractor: { nameNormalized: { in: dto.contractor } } });
    if (dto.grbs?.length) AND.push({ grbs: { nameNormalized: { in: dto.grbs } } });
    if (dto.yearFrom !== undefined || dto.yearTo !== undefined) {
      AND.push({
        OR: [
          { commissioningYear: { gte: dto.yearFrom, lte: dto.yearTo } },
          { commissioningYear: null, yearEnd: { gte: dto.yearFrom, lte: dto.yearTo } },
        ],
      });
    }
    if (dto.readinessMin !== undefined) AND.push({ readinessPct: { gte: dto.readinessMin } });
    if (dto.hasGeometry !== undefined) {
      const has = dto.hasGeometry === 'true';
      AND.push(
        has
          ? { geocodeSource: { in: ['csv', 'geocoder', 'manual'] } }
          : { OR: [{ geocodeSource: null }, { geocodeSource: 'inferred_from_name' }] },
      );
    }
    if (dto.hasMedia === 'true') AND.push({ mediaAssets: { some: {} } });
    if (dto.hasCamera === 'true') AND.push({ cameraSources: { some: {} } });
    if (dto.q?.trim()) {
      const q = dto.q.trim();
      AND.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { addressNormalized: { contains: q, mode: 'insensitive' } },
          { addressRaw: { contains: q, mode: 'insensitive' } },
          { contractor: { nameNormalized: { contains: q, mode: 'insensitive' } } },
          { customer: { nameNormalized: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (spatialIds) AND.push({ id: { in: spatialIds } });
    return AND.length ? { AND } : {};
  }

  /** Пространственные фильтры (bbox ∩ near) → список id или null. */
  private async resolveSpatial(dto: ListObjectsDto): Promise<{ ids: string[] | null; applied: boolean }> {
    let ids: string[] | null = null;
    let applied = false;
    if (dto.bbox) {
      ids = this.intersectIds(ids, await this.idsInBbox(dto.bbox));
      applied = true;
    }
    if (dto.near) {
      ids = this.intersectIds(ids, await this.idsNear(dto.near));
      applied = true;
    }
    return { ids, applied };
  }

  private orderBy(sort?: ListObjectsDto['sort']): Prisma.ObjectOrderByWithRelationInput[] {
    switch (sort) {
      case 'commissioningYear':
        return [{ commissioningYear: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }];
      case 'readiness':
        return [{ readinessPct: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }];
      case 'yearEnd':
        return [{ yearEnd: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }];
      case 'name':
      default:
        return [{ name: 'asc' }];
    }
  }

  private async fetchGeometry(ids: string[]): Promise<Map<string, GeomRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<GeomRow[]>`
      SELECT o.id::text AS id,
             ST_AsGeoJSON(o.geom) AS geom_json,
             ST_AsGeoJSON(COALESCE(o.geom, m.center)) AS display_json,
             (o.geom IS NULL) AS approx
      FROM objects o
      LEFT JOIN municipalities m ON m.id = o.municipality_id
      WHERE o.id = ANY(${ids}::uuid[])
    `;
    return new Map(rows.map((r) => [r.id, r]));
  }

  async list(dto: ListObjectsDto): Promise<Paginated<ObjectSummary>> {
    const { page, limit, skip } = normalizePagination(dto.page, dto.limit);
    const spatial = await this.resolveSpatial(dto);
    if (spatial.applied && spatial.ids && spatial.ids.length === 0) return paginated([], 0, page, limit);

    const where = this.buildWhere(dto, spatial.ids);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.object.count({ where }),
      this.prisma.object.findMany({
        where,
        orderBy: this.orderBy(dto.sort),
        skip,
        take: limit,
        include: LIST_INCLUDE,
      }),
    ]);

    const geom = await this.fetchGeometry(rows.map((r) => r.id));
    const items = rows.map((r) => this.toSummary(r, geom.get(r.id)));
    return paginated(items, total, page, limit);
  }

  /** Все объекты под фильтр (без пагинации) — для экспорта (§7 Ф9). */
  async listAllForExport(dto: ListObjectsDto): Promise<ObjectSummary[]> {
    const spatial = await this.resolveSpatial(dto);
    if (spatial.applied && spatial.ids && spatial.ids.length === 0) return [];
    const where = this.buildWhere(dto, spatial.ids);
    const rows = await this.prisma.object.findMany({
      where,
      orderBy: this.orderBy(dto.sort),
      include: LIST_INCLUDE,
      take: 10_000, // защита от выгрузки всей таблицы; реестр ~95, запас до 10 000 (§9)
    });
    const geom = await this.fetchGeometry(rows.map((r) => r.id));
    return rows.map((r) => this.toSummary(r, geom.get(r.id)));
  }

  /** Контракты/закупки объекта (Ф6; на MVP — мок-данные из сида). */
  async contracts(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.contract.findMany({ where: { objectId: id }, orderBy: { date: 'desc' } });
    return rows.map((c) => ({
      id: c.id,
      number: c.number,
      date: isoDate(c.date),
      price: c.price ? Number(c.price) : null,
      stage: c.stage,
      status: c.status,
      customer: c.customer,
      contractor: c.contractor,
      executionStart: isoDate(c.executionStart),
      executionEnd: isoDate(c.executionEnd),
      source: c.source,
      url: c.url,
      isMock: c.isMock,
    }));
  }

  /** Медиа объекта «До/В процессе/После» (Ф3). */
  async media(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.mediaAsset.findMany({ where: { objectId: id }, orderBy: { takenAt: 'asc' } });
    return rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      url: m.url,
      takenAt: isoDate(m.takenAt),
      year: m.year,
      caption: m.caption,
      license: m.license,
      bounds: (m.bounds as unknown) ?? null,
      isMock: m.isMock,
    }));
  }

  /** Камеры стройплощадки (Ф3). */
  async cameras(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.cameraSource.findMany({ where: { objectId: id } });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      url: c.url,
      refreshSec: c.refreshSec ?? 30,
      isActive: c.isActive,
      isMock: c.isMock,
    }));
  }

  /** Публичные (обезличенные) обращения по объекту (Ф8; заполняется в итерации 6). */
  async appeals(id: string) {
    await this.assertExists(id);
    const rows = await this.prisma.appeal.findMany({
      where: { objectId: id, status: { in: ['resolved', 'accepted', 'forwarded'] } },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => ({
      publicId: a.publicId,
      categoryCode: a.category.code,
      categoryTitle: a.category.title,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      descriptionAnonymized: a.descriptionAnonymized,
      isMock: a.isMock,
    }));
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.object.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Объект с id ${id} не найден`);
  }

  async getById(id: string): Promise<ObjectDetails> {
    const row = await this.prisma.object.findUnique({
      where: { id },
      include: { ...DETAIL_INCLUDE, contracts: { orderBy: { date: 'desc' } } },
    });
    if (!row) throw new NotFoundException(`Объект с id ${id} не найден`);
    const geom = await this.fetchGeometry([row.id]);
    return this.toDetails(row, geom.get(row.id));
  }

  async getGeoJson(id: string): Promise<unknown> {
    const row = await this.prisma.object.findUnique({ where: { id }, include: { municipality: true } });
    if (!row) throw new NotFoundException(`Объект с id ${id} не найден`);
    const geom = await this.fetchGeometry([id]);
    const g = geom.get(id);
    const display = coordsFromGeoJson(g?.display_json ?? null);
    return {
      type: 'Feature',
      id,
      geometry: display ? { type: 'Point', coordinates: display } : null,
      properties: {
        name: row.name,
        municipality: row.municipality?.nameShort ?? null,
        locationApproximate: g?.approx ?? true,
      },
    };
  }

  /** Строки для экспорта (расширенный набор колонок, включая заказчика/подрядчика). */
  async findForExport(dto: ListObjectsDto): Promise<ExportRow[]> {
    const spatial = await this.resolveSpatial(dto);
    if (spatial.applied && spatial.ids && spatial.ids.length === 0) return [];
    const where = this.buildWhere(dto, spatial.ids);
    const rows = await this.prisma.object.findMany({
      where,
      orderBy: this.orderBy(dto.sort),
      include: {
        industry: true,
        status: true,
        municipality: true,
        capacityUnit: true,
        customer: true,
        contractor: true,
      },
      take: 10_000,
    });
    const geom = await this.fetchGeometry(rows.map((r) => r.id));
    return rows.map((r) => {
      const g = geom.get(r.id);
      const display = coordsFromGeoJson(g?.display_json ?? null);
      return {
        extId: r.extId ?? String(r.sourceRowNumber),
        name: r.name,
        industryName: r.industry?.name ?? '',
        statusName: r.status?.name ?? '',
        statusGroup: r.status?.groupCode ?? '',
        ownership: ownershipLabel(r.ownership),
        municipalityName: r.municipality?.nameShort ?? '',
        address: r.addressNormalized ?? r.addressRaw ?? '',
        lon: display ? display[0] : null,
        lat: display ? display[1] : null,
        locationApproximate: g?.approx ?? display === null,
        readinessPct: toNum(r.readinessPct),
        areaM2: toNum(r.areaM2),
        capacityValue: toNum(r.capacityValue),
        capacityUnit: r.capacityUnit?.name ?? '',
        yearStart: r.yearStart,
        yearEnd: r.yearEnd,
        commissioningYear: r.commissioningYear,
        customer: r.customer?.nameNormalized ?? '',
        contractor: r.contractor?.nameNormalized ?? '',
      };
    });
  }

  private toSummary(r: ListRow | DetailRow, g?: GeomRow): ObjectSummary {
    const point = coordsFromGeoJson(g?.geom_json ?? null);
    const displayPoint = coordsFromGeoJson(g?.display_json ?? null);
    return {
      id: r.id,
      extId: r.extId ?? null,
      name: r.name,
      industryCode: r.industry?.code ?? null,
      industryName: r.industry?.name ?? null,
      statusCode: r.status?.code ?? null,
      statusName: r.status?.name ?? null,
      statusGroup: (r.status?.groupCode as ObjectSummary['statusGroup']) ?? null,
      ownership: r.ownership,
      municipalityId: r.municipalityId ?? null,
      municipalityName: r.municipality?.nameShort ?? null,
      addressNormalized: r.addressNormalized ?? null,
      point,
      displayPoint: displayPoint ?? point,
      locationApproximate: g?.approx ?? point === null,
      geocodeSource: r.geocodeSource ?? null,
      geocodeConfidence: r.geocodeConfidence ?? null,
      readinessPct: toNum(r.readinessPct),
      areaM2: toNum(r.areaM2),
      capacityValue: toNum(r.capacityValue),
      capacityUnitCode: r.capacityUnit?.code ?? null,
      yearStart: r.yearStart ?? null,
      yearEnd: r.yearEnd ?? null,
      commissioningYear: r.commissioningYear ?? null,
      riskFlags: r.riskFlags ?? [],
      hasMedia: (r._count?.mediaAssets ?? 0) > 0,
      hasCamera: (r._count?.cameraSources ?? 0) > 0,
    };
  }

  private toDetails(r: DetailRow, g?: GeomRow): ObjectDetails {
    const summary = this.toSummary(r, g);
    return {
      ...summary,
      grbs: r.grbs ? { id: String(r.grbs.id), name: r.grbs.nameNormalized } : null,
      customer: r.customer ? { id: String(r.customer.id), name: r.customer.nameNormalized } : null,
      contractor: r.contractor ? { id: String(r.contractor.id), name: r.contractor.nameNormalized } : null,
      contractorContractRefs: asArray<never>(r.contractorContractRefs),
      addressRaw: r.addressRaw ?? null,
      constructionStage: r.constructionStage ?? null,
      capacityParts: asArray<never>(r.capacityParts),
      capacityRaw: r.capacityRaw ?? null,
      expertise: asArray<never>(r.expertise),
      constructionPeriod: r.constructionPeriod ?? null,
      contractPeriod:
        r.contractPeriodStart || r.contractPeriodEnd || r.contractPeriodRaw
          ? {
              start: isoDate(r.contractPeriodStart),
              end: isoDate(r.contractPeriodEnd),
              raw: r.contractPeriodRaw ?? '',
              note: r.contractPeriodNote ?? undefined,
            }
          : null,
      landTransferDate: isoDate(r.landTransferDate),
      permitDate: isoDate(r.permitDate),
      contractDate: isoDate(r.contractDate),
      equipmentDate: isoDate(r.equipmentDate),
      hydraulicTestDate: isoDate(r.hydraulicTestDate),
      zosDate: isoDate(r.zosDate),
      zosNumber: r.zosNumber ?? null,
      actDate: isoDate(r.actDate),
      actNumber: r.actNumber ?? null,
      photoDate: isoDate(r.photoDate),
      projectCode: r.projectCode ?? null,
      programNp: r.programNp?.nameNormalized ?? null,
      programFp: r.programFp?.nameNormalized ?? null,
      municipalitySource: r.municipalitySource ?? null,
      municipalityConflict: r.municipalityConflict ?? false,
      timeline: asArray<never>(r.timeline),
      historyOfPlace: (r.historyOfPlace as ObjectDetails['historyOfPlace']) ?? null,
      raw: (r.raw as Record<string, string>) ?? null,
      sourceRowNumber: r.sourceRowNumber,
      importedAt: r.importedAt ? new Date(r.importedAt).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    };
  }
}

/** Json-поле Prisma (массив) → типизированный массив без `any`. */
function asArray<T>(json: Prisma.JsonValue | null): T[] {
  return Array.isArray(json) ? (json as T[]) : [];
}
