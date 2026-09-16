import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_DURATIONS_SEC,
  ISOCHRONE_DISCLAIMER_LIVE,
  ISOCHRONE_DISCLAIMER_MOCK,
  ISOCHRONE_DISCLAIMER_UNAVAILABLE,
  ISOCHRONE_PRESETS,
  ISOCHRONE_TRANSPORTS,
  POI_SPHERES,
  durationLabelRu,
  haversineM,
  multiPolygonAreaM2,
  multiPolygonBounds,
  reverseToDirection,
  type AccessibilityReport,
  type CoverageMunicipalityRow,
  type CoverageResult,
  type GeoJsonFeature,
  type GeoJsonGeometry,
  type GeoJsonMultiPolygon,
  type IsochroneBatchResult,
  type IsochroneResult,
  type IsochroneStatus,
  type IsochroneTransport,
  type IsochroneZone,
  type LngLat,
  type SphereCode,
} from '@oks/shared';
import { PrismaService } from '../../common/prisma.service';
import { loadConfig, type AppConfig } from '../../config/env';
import { createIsochroneProvider, MockIsochroneProvider } from '../../integrations/2gis/isochrone.provider';
import { createPoiProvider } from '../../integrations/2gis/poi.provider';
import { geoJsonToWkt } from '../../integrations/2gis/wkt';
import type {
  IsochroneProvider,
  IsochroneProviderResult,
  IsochroneRequest,
  IsochroneZoneRaw,
  PoiProvider,
  PoiSearchRequest,
  PoiSearchResult,
} from '../../integrations/2gis/types';
import { buildAccessibilityReport, type MunicipalityFacts, type RegistryPeer } from './accessibility';
import type { BatchIsochroneDto, CoverageQueryDto } from './dto/isochrone.dto';

/**
 * Сервис зон пешей доступности и отчёта доступности (§4.2, §4.4, §7 Ф4).
 *
 * Требования ТЗ, реализованные здесь:
 *  - все вызовы 2ГИС — только отсюда: браузер ключей не видит (§4.5, §15.4);
 *  - кэш в PostGIS `isochrone_cache` (TTL 30 суток): при попадании в кэш повторный
 *    запрос к Isochrone API НЕ выполняется (§4.2, §13 «Изохроны»);
 *  - WKT → GeoJSON на бэкенде (§4.2); геометрия передаётся в Search API тем же
 *    WKT параметром `polygon` (§4.6 — «напрямую, без конвертации»);
 *  - «белые пятна» и сводное покрытие считаются в PostGIS (ST_Union/ST_Difference/
 *    ST_Area), а не в браузере (§15.6);
 *  - объекты без точной геометрии в расчёт НЕ включаются без явного согласия
 *    пользователя (`allowApproximate=true`, §6.3 п.7);
 *  - демо-режим помечен `isMock` + отдельный дисклеймер (§10, §15.1).
 */

interface ObjectFacts {
  id: string;
  name: string;
  municipalityId: string | null;
  municipalityName: string | null;
  industryName: string | null;
  sphere: SphereCode | null;
  point: LngLat | null;
  center: LngLat | null;
  population: number | null;
  populationYear: number | null;
  populationSource: string | null;
  areaKm2: number | null;
  densityPerKm2: number | null;
}

interface ObjectFactsRow {
  id: string;
  name: string;
  municipality_id: string | null;
  municipality_name: string | null;
  industry_name: string | null;
  sphere: string | null;
  geom_json: string | null;
  center_json: string | null;
  population: number | null;
  population_year: number | null;
  population_source: string | null;
  area_km2: string | null;
  density_per_km2: string | null;
}

interface CacheRow {
  duration_sec: number;
  geom_json: string | null;
  area_m2: number | null;
  provider: string;
  is_mock: boolean;
  location_approximate: boolean;
  generated_at: Date;
  expires_at: Date;
  poi_snapshot: unknown;
  poi_generated_at: Date | null;
}

interface PeerRow {
  id: string;
  name: string;
  municipality_id: string | null;
  sphere: string | null;
  status_name: string | null;
  geom_json: string | null;
}

interface SelectionRow {
  id: string;
  name: string;
}

interface CoverageRow {
  id: string;
  name_short: string;
  population: number | null;
  population_year: number | null;
  population_source: string | null;
  area_km2: string | null;
  density_per_km2: string | null;
  covered_km2: number | null;
  covered_json: string | null;
  white_json: string | null;
  has_coverage: boolean | null;
}

/** POI-снимок, хранимый в `isochrone_cache.poi_snapshot` (TTL — CACHE_TTL_POI_DAYS). */
interface PoiSnapshot {
  generatedAt: string;
  provider: 'mock' | 'live';
  results: PoiSearchResult[];
}

export interface ZonesRequest {
  durations: number[];
  reverse: boolean;
  transport: IsochroneTransport;
  allowApproximate: boolean;
  force?: boolean;
}

function parsePoint(json: string | null): LngLat | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { type?: string; coordinates?: number[] };
    if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
      return [parsed.coordinates[0], parsed.coordinates[1]];
    }
  } catch {
    return null;
  }
  return null;
}

/** ST_AsGeoJSON → MultiPolygon (Polygon нормализуется: схема БД — MultiPolygon, §6.2). */
export function parseMultiPolygon(json: string | null): GeoJsonMultiPolygon | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as GeoJsonGeometry;
    if (parsed.type === 'MultiPolygon') return parsed;
    if (parsed.type === 'Polygon') {
      const coordinates = [parsed.coordinates] as unknown as number[][][][];
      return { type: 'MultiPolygon', coordinates };
    }
  } catch {
    return null;
  }
  return null;
}

function parseGeometry(json: string | null): GeoJsonGeometry | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as GeoJsonGeometry;
    if (parsed.type === 'MultiPolygon' || parsed.type === 'Polygon') return parsed;
  } catch {
    return null;
  }
  return null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function round3(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

/** Максимальное удаление границы зоны от точки — радиус для fallback point+radius. */
function zoneRadiusM(center: LngLat, geometry: GeoJsonMultiPolygon): number {
  const bounds = multiPolygonBounds(geometry);
  if (!bounds) return 0;
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const corners: LngLat[] = [
    [minLon, minLat],
    [maxLon, minLat],
    [minLon, maxLat],
    [maxLon, maxLat],
  ];
  return Math.max(0, ...corners.map((c) => haversineM(center, c)));
}

@Injectable()
export class IsochroneService {
  private readonly logger = new Logger(IsochroneService.name);
  private readonly cfg: AppConfig;
  private readonly isochrones: IsochroneProvider;
  private readonly poi: PoiProvider;
  /** Single-flight: параллельные одинаковые запросы не дублируют вызов API. */
  private readonly inflight = new Map<string, Promise<IsochroneProviderResult>>();
  /** Метрики расхода квот (§4.5) — без ключей и ПДн. */
  private quota = { isochroneApiCalls: 0, zonesBuilt: 0, cacheHits: 0, poiApiCalls: 0, poiItems: 0 };

  constructor(private readonly prisma: PrismaService) {
    this.cfg = loadConfig(process.env);
    this.isochrones = createIsochroneProvider({
      ISOCHRONE_PROVIDER: this.cfg.providers.isochrone,
      ROUTING_API_KEY: this.cfg.routingApiKey ?? undefined,
      ISOCHRONE_MOCK_GEOMETRY: this.cfg.isochrone.mockGeometry ? 'true' : 'false',
    });
    this.poi = createPoiProvider({
      POI_PROVIDER: this.cfg.providers.poi,
      CATALOG_API_KEY: this.cfg.catalogApiKey ?? undefined,
      REGION_ID: this.cfg.regionId,
    });
    this.logger.log(
      `IsochroneProvider=${this.isochrones.kind} (демо-геометрия: ${this.syntheticGeometry ? 'включена' : 'выключена'}), ` +
        `PoiProvider=${this.poi.kind}, region_id=${this.cfg.regionId}, ` +
        `TTL изохрон=${this.cfg.cache.isochroneTtlDays} сут., TTL POI=${this.cfg.cache.poiTtlDays} сут.`,
    );
  }

  private get isMockZones(): boolean {
    return this.isochrones.kind === 'mock';
  }

  private get syntheticGeometry(): boolean {
    return this.isochrones instanceof MockIsochroneProvider ? this.isochrones.syntheticGeometry : false;
  }

  private get disclaimer(): string {
    if (this.isochrones.kind === 'live') return ISOCHRONE_DISCLAIMER_LIVE;
    return this.syntheticGeometry ? ISOCHRONE_DISCLAIMER_MOCK : ISOCHRONE_DISCLAIMER_UNAVAILABLE;
  }

  // -------------------------------------------------------------------------
  // Статус интеграций Ф4 — для честных бейджей и счётчиков в UI
  // -------------------------------------------------------------------------

  async status(): Promise<IsochroneStatus> {
    const cached = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM isochrone_cache
      WHERE expires_at > now() AND is_mock = ${this.isMockZones}
    `;
    const available = this.isochrones.kind === 'live' || this.syntheticGeometry;
    return {
      isochroneProvider: this.isochrones.kind,
      poiProvider: this.poi.kind,
      available,
      syntheticGeometry: this.syntheticGeometry,
      presets: ISOCHRONE_PRESETS.map((p) => ({ durationSec: p.durationSec, label: p.label, short: p.short })),
      defaultDurations: [...DEFAULT_DURATIONS_SEC],
      transports: [...ISOCHRONE_TRANSPORTS],
      cacheTtlDays: this.cfg.cache.isochroneTtlDays,
      poiCacheTtlDays: this.cfg.cache.poiTtlDays,
      cachedZones: cached[0]?.count ?? 0,
      quota: { ...this.quota },
      disclaimer: this.disclaimer,
      note: !available
        ? ISOCHRONE_DISCLAIMER_UNAVAILABLE
        : this.isochrones.kind === 'live'
          ? 'Зоны строятся по пешеходной сети 2ГИС (Isochrone API) и кэшируются в PostGIS.'
          : 'Демо-режим: зоны строятся геометрической моделью и помечаются «ДЕМО-ДАННЫЕ». ' +
            'Для расчёта по пешеходной сети задайте ROUTING_API_KEY и ISOCHRONE_PROVIDER=live.',
    };
  }

  // -------------------------------------------------------------------------
  // Зоны доступности объекта: кэш PostGIS → Isochrone API
  // -------------------------------------------------------------------------

  async zonesFor(objectId: string, request: ZonesRequest): Promise<IsochroneResult> {
    const facts = await this.loadObjectFacts(objectId);
    const built = await this.buildForObject(facts, request);
    return built.result;
  }

  private async buildForObject(
    facts: ObjectFacts,
    request: ZonesRequest,
  ): Promise<{ result: IsochroneResult; status: 'built' | 'cached' | 'failed' | 'skipped_no_geometry' }> {
    const durations = [...new Set(request.durations)].sort((a, b) => a - b);
    const base = {
      objectId: facts.id,
      objectName: facts.name,
      transport: request.transport,
      reverse: request.reverse,
      direction: reverseToDirection(request.reverse),
      disclaimer: this.disclaimer,
      provider: this.isochrones.kind,
      isMock: this.isMockZones,
    };

    const startPoint = facts.point ?? (request.allowApproximate ? facts.center : null);
    const approximate = facts.point === null && startPoint !== null;
    if (!startPoint) {
      return {
        status: 'skipped_no_geometry',
        result: {
          ...base,
          startPoint: [0, 0],
          locationApproximate: false,
          zones: [],
          available: false,
          unavailableReason: 'no_geometry',
          note:
            'У объекта нет точного местоположения в реестре. Расчёт зон без геометрии запрещён (§6.3 п.7). ' +
            'Включите «приближённая геометрия (центроид МО)», чтобы получить оценку, — она будет помечена.',
          stats: { fromCache: 0, built: 0, failed: 0 },
        },
      };
    }

    const cached = request.force ? [] : await this.readCache(facts.id, request, durations, true);
    const cachedDurations = new Set(cached.map((c) => c.duration_sec));
    const missing = durations.filter((d) => !cachedDurations.has(d));
    let providerFailure: string | null = null;

    if (missing.length > 0) {
      const result = await this.callProvider({
        start: startPoint,
        durations: missing,
        reverse: request.reverse,
        transport: request.transport,
        seed: facts.id,
      });
      const okZones = result.zones.filter((z) => z.geometry !== null);
      if (okZones.length === 0) {
        providerFailure = result.note ?? `Isochrone API вернул статус ${result.status}`;
      }
      for (const zone of okZones) {
        await this.writeCache(facts.id, request, zone, result.apiVersion, startPoint, approximate);
      }
    }

    const rows = missing.length > 0 ? await this.readCache(facts.id, request, durations, false) : cached;
    const zones = rows.map((row) =>
      this.toZone(row, cachedDurations.has(row.duration_sec) ? 'cache' : 'api'),
    );
    const status: 'built' | 'cached' | 'failed' =
      zones.length === 0 ? 'failed' : missing.length === 0 ? 'cached' : 'built';

    return {
      status,
      result: {
        ...base,
        startPoint,
        locationApproximate: approximate,
        zones,
        available: zones.length > 0,
        unavailableReason: zones.length === 0 ? this.unavailableReason(providerFailure) : undefined,
        note:
          providerFailure ??
          (approximate
            ? 'Зона построена от приближённой точки (центроид МО): местоположение объекта уточняется (§6.3 п.7).'
            : null),
        stats: {
          fromCache: zones.filter((z) => cachedDurations.has(z.durationSec)).length,
          built: zones.filter((z) => !cachedDurations.has(z.durationSec)).length,
          failed: Math.max(0, durations.length - zones.length),
        },
      },
    };
  }

  private unavailableReason(providerFailure: string | null): IsochroneResult['unavailableReason'] {
    if (this.isochrones.kind === 'mock' && !this.syntheticGeometry) return 'disabled';
    if (providerFailure?.includes('204')) return 'not_found';
    if (providerFailure?.includes('429') || providerFailure?.includes('квот')) return 'quota';
    return 'provider_error';
  }

  private async callProvider(request: IsochroneRequest): Promise<IsochroneProviderResult> {
    const key =
      `${request.start[0].toFixed(6)},${request.start[1].toFixed(6)}` +
      `|${request.durations.join('+')}|${request.reverse}|${request.transport}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = (async (): Promise<IsochroneProviderResult> => {
      this.quota.isochroneApiCalls += 1;
      const result = await this.isochrones.build(request);
      this.quota.zonesBuilt += result.zones.filter((z) => z.geometry).length;
      if (result.status === 'error' || result.status === 'build_error') {
        // содержимое запроса и ключ в лог не попадают (§15.11)
        this.logger.warn(`Isochrone API: ${result.status} — ${result.note ?? 'без пояснения'}`);
      }
      return result;
    })();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async readCache(
    objectId: string,
    request: ZonesRequest,
    durations: number[],
    countHits: boolean,
  ): Promise<CacheRow[]> {
    if (durations.length === 0) return [];
    const rows = await this.prisma.$queryRaw<CacheRow[]>`
      SELECT duration_sec, ST_AsGeoJSON(geom) AS geom_json, area_m2, provider, is_mock,
             location_approximate, generated_at, expires_at, poi_snapshot, poi_generated_at
      FROM isochrone_cache
      WHERE object_id = ${objectId}::uuid
        AND transport = ${request.transport}
        AND reverse = ${request.reverse}
        AND is_mock = ${this.isMockZones}
        AND duration_sec = ANY(${durations}::int[])
        AND geom IS NOT NULL
        AND expires_at > now()
      ORDER BY duration_sec
    `;
    if (countHits) this.quota.cacheHits += rows.length;
    return rows;
  }

  private async writeCache(
    objectId: string,
    request: ZonesRequest,
    zone: IsochroneZoneRaw,
    apiVersion: string | null,
    startPoint: LngLat,
    approximate: boolean,
  ): Promise<void> {
    const geomJson = JSON.stringify(zone.geometry);
    const ttlDays = this.cfg.cache.isochroneTtlDays;
    await this.prisma.$executeRaw`
      INSERT INTO isochrone_cache
        (object_id, transport, duration_sec, reverse, geom, start_point, area_m2,
         location_approximate, provider, is_mock, api_version, generated_at, expires_at)
      VALUES
        (${objectId}::uuid, ${request.transport}, ${zone.durationSec}, ${request.reverse},
         ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)),
         ST_SetSRID(ST_MakePoint(${startPoint[0]}, ${startPoint[1]}), 4326),
         ST_Area(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))::geography),
         ${approximate}, ${this.isochrones.kind}, ${this.isMockZones},
         ${apiVersion ?? (this.isMockZones ? 'demo-model' : null)},
         now(), now() + make_interval(days => ${ttlDays}::int))
      ON CONFLICT (object_id, transport, duration_sec, reverse) DO UPDATE SET
        geom = EXCLUDED.geom,
        start_point = EXCLUDED.start_point,
        area_m2 = ST_Area(EXCLUDED.geom::geography),
        location_approximate = EXCLUDED.location_approximate,
        provider = EXCLUDED.provider,
        is_mock = EXCLUDED.is_mock,
        api_version = EXCLUDED.api_version,
        generated_at = now(),
        expires_at = EXCLUDED.expires_at,
        poi_snapshot = NULL,
        poi_generated_at = NULL
    `;
  }

  private toZone(row: CacheRow, source: 'cache' | 'api'): IsochroneZone {
    const geometry = parseMultiPolygon(row.geom_json);
    return {
      durationSec: row.duration_sec,
      durationLabel: durationLabelRu(row.duration_sec),
      geometry: geometry ?? { type: 'MultiPolygon', coordinates: [] },
      areaM2: toNumber(row.area_m2) ?? (geometry ? multiPolygonAreaM2(geometry) : null),
      // демо-зона никогда не выдаётся за результат API (§15.1)
      source: row.is_mock ? 'model' : source,
      isMock: row.is_mock,
      generatedAt: row.generated_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      buildStatus: row.is_mock ? 'model' : 'OK',
    };
  }

  // -------------------------------------------------------------------------
  // Отчёт доступности (§7 Ф4)
  // -------------------------------------------------------------------------

  async report(
    objectId: string,
    request: ZonesRequest & { allSpheres: boolean; refreshPoi: boolean },
  ): Promise<AccessibilityReport> {
    const facts = await this.loadObjectFacts(objectId);
    const durationSec = request.durations[0] ?? DEFAULT_DURATIONS_SEC[DEFAULT_DURATIONS_SEC.length - 1];
    const { result } = await this.buildForObject(facts, { ...request, durations: [durationSec] });
    const zone = result.zones.find((z) => z.durationSec === durationSec) ?? null;

    const spheres = this.spheresForReport(facts.sphere, request.allSpheres);
    const poiResults = zone
      ? await this.poiSnapshot(objectId, zone, request, spheres, result.startPoint, request.refreshPoi)
      : [];
    const peers = zone && facts.sphere ? await this.loadPeers(facts, zone, result.startPoint) : [];

    const municipality: MunicipalityFacts | null = facts.municipalityId
      ? {
          population: facts.population,
          areaKm2: facts.areaKm2,
          densityPerKm2: facts.densityPerKm2,
          populationSource: facts.populationSource,
          populationYear: facts.populationYear,
          populationIsMock:
            this.cfg.providers.population === 'mock' || /демо/i.test(facts.populationSource ?? ''),
        }
      : null;

    const report = buildAccessibilityReport({
      object: {
        id: facts.id,
        name: facts.name,
        sphere: facts.sphere,
        industryName: facts.industryName,
        municipalityId: facts.municipalityId,
        municipalityName: facts.municipalityName,
        point: result.startPoint,
      },
      zone,
      reverse: request.reverse,
      municipality,
      poiResults,
      peers,
      poiProviderKind: this.poi.kind,
      generatedAt: new Date().toISOString(),
    });

    return {
      ...report,
      durationSec,
      approximateLocation: result.locationApproximate,
      disclaimer: zone ? report.disclaimer : this.disclaimer,
      provider: this.isochrones.kind === 'live' && this.poi.kind === 'live' ? 'live' : 'mock',
    };
  }

  /** Какие сферы POI считаем: сфера объекта + жильё (либо все 5 сфер — `allSpheres`). */
  private spheresForReport(sphere: SphereCode | null, allSpheres: boolean): (SphereCode | 'residential')[] {
    if (allSpheres) return [...POI_SPHERES, 'residential'];
    // для объектов вне 5 сфер — базовый охват (образование и здравоохранение)
    if (!sphere) return ['education', 'health', 'residential'];
    return [sphere, 'residential'];
  }

  /** POI-снимок: кэш в `isochrone_cache.poi_snapshot` → Search API только при промахе. */
  private async poiSnapshot(
    objectId: string,
    zone: IsochroneZone,
    request: ZonesRequest,
    spheres: (SphereCode | 'residential')[],
    center: LngLat,
    refresh: boolean,
  ): Promise<PoiSearchResult[]> {
    const rows = await this.prisma.$queryRaw<{ poi_snapshot: unknown; poi_generated_at: Date | null }[]>`
      SELECT poi_snapshot, poi_generated_at FROM isochrone_cache
      WHERE object_id = ${objectId}::uuid AND transport = ${request.transport}
        AND duration_sec = ${zone.durationSec} AND reverse = ${request.reverse}
      LIMIT 1
    `;
    const row = rows[0];
    const snapshot = (row?.poi_snapshot as PoiSnapshot | null) ?? null;
    const freshByTime =
      row?.poi_generated_at instanceof Date &&
      Date.now() - row.poi_generated_at.getTime() < this.cfg.cache.poiTtlDays * 86_400_000;
    const freshByProvider = snapshot?.provider === this.poi.kind;
    const coversSpheres = Boolean(snapshot && spheres.every((s) => snapshot.results.some((r) => r.sphere === s)));

    if (!refresh && snapshot && freshByTime && freshByProvider && coversSpheres) {
      this.quota.cacheHits += 1;
      return snapshot.results.filter((r) => spheres.includes(r.sphere));
    }

    // §4.6: геометрию изохроны передаём в Search API параметром `polygon` НАПРЯМУЮ (WKT)
    const wkt = geoJsonToWkt(zone.geometry);
    const radius = zoneRadiusM(center, zone.geometry);
    const results: PoiSearchResult[] = [];
    for (const sphere of spheres) {
      const searchRequest: PoiSearchRequest = {
        polygonWkt: wkt ?? '',
        geometry: zone.geometry,
        sphere,
        center,
        maxRadiusM: radius,
      };
      const res = await this.poi.searchInPolygon(searchRequest);
      this.quota.poiApiCalls += res.pagesFetched;
      this.quota.poiItems += res.items.length;
      results.push(res);
    }

    const payload: PoiSnapshot = { generatedAt: new Date().toISOString(), provider: this.poi.kind, results };
    await this.prisma.$executeRaw`
      UPDATE isochrone_cache
      SET poi_snapshot = ${JSON.stringify(payload)}::jsonb, poi_generated_at = now()
      WHERE object_id = ${objectId}::uuid AND transport = ${request.transport}
        AND duration_sec = ${zone.durationSec} AND reverse = ${request.reverse}
    `;
    return results;
  }

  /** Объекты реестра ОКС той же сферы рядом с зоной (реальные данные, §15.7). */
  private async loadPeers(facts: ObjectFacts, zone: IsochroneZone, center: LngLat): Promise<RegistryPeer[]> {
    if (!facts.sphere) return [];
    const radius = Math.max(this.cfg.isochrone.peersRadiusM, zoneRadiusM(center, zone.geometry) * 2);
    const rows = await this.prisma.$queryRaw<PeerRow[]>`
      SELECT o.id::text AS id, o.name, o.municipality_id, i.sphere::text AS sphere,
             s.name AS status_name, ST_AsGeoJSON(o.geom) AS geom_json
      FROM objects o
      JOIN industries i ON i.id = o.industry_id
      LEFT JOIN statuses s ON s.id = o.status_id
      WHERE i.sphere = ${facts.sphere}::"Sphere"
        AND o.geom IS NOT NULL
        AND o.id <> ${facts.id}::uuid
        AND ST_DWithin(o.geom::geography,
                       ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326)::geography,
                       ${radius})
      ORDER BY o.name
      LIMIT 200
    `;
    const peers: RegistryPeer[] = [];
    for (const row of rows) {
      const point = parsePoint(row.geom_json);
      if (!point) continue;
      peers.push({
        id: row.id,
        name: row.name,
        sphere: (row.sphere as SphereCode | null) ?? null,
        point,
        municipalityId: row.municipality_id,
        statusName: row.status_name,
      });
    }
    return peers;
  }

  // -------------------------------------------------------------------------
  // Пакетный режим: построение зон, сводное покрытие и «белые пятна» (§7 Ф4)
  // -------------------------------------------------------------------------

  async batch(dto: BatchIsochroneDto): Promise<IsochroneBatchResult> {
    const filters = this.selectionFilters(dto);
    const counters = this.selectionFilters(dto, false);
    const limit = this.cfg.isochrone.batchMaxObjects;
    const rows = await this.prisma.$queryRaw<SelectionRow[]>`
      SELECT o.id::text AS id, o.name
      FROM objects o
      LEFT JOIN industries i ON i.id = o.industry_id
      LEFT JOIN statuses s ON s.id = o.status_id
      WHERE TRUE ${filters}
      ORDER BY o.name
      LIMIT ${limit}
    `;
    const counts = await this.prisma.$queryRaw<{ with_geom: number; without_geom: number }[]>`
      SELECT count(*) FILTER (WHERE o.geom IS NOT NULL)::int AS with_geom,
             count(*) FILTER (WHERE o.geom IS NULL)::int AS without_geom
      FROM objects o
      LEFT JOIN industries i ON i.id = o.industry_id
      LEFT JOIN statuses s ON s.id = o.status_id
      WHERE TRUE ${counters}
    `;
    const withoutGeometry = counts[0]?.without_geom ?? 0;

    const request: ZonesRequest = {
      durations: dto.durationList,
      reverse: dto.isReverse,
      transport: 'walking',
      allowApproximate: dto.approximateAllowed,
      force: dto.forceRebuild,
    };

    const items: IsochroneBatchResult['items'] = [];
    let built = 0;
    let fromCache = 0;
    let failed = 0;
    let skipped = 0;

    // Ограниченный параллелизм: не превышаем квоту 2ГИС (§4.5)
    const queue = [...rows];
    const workerCount = Math.max(1, Math.min(4, queue.length));
    const workers = Array.from({ length: workerCount }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        try {
          const facts = await this.loadObjectFacts(row.id);
          const res = await this.buildForObject(facts, request);
          if (res.status === 'skipped_no_geometry') skipped += 1;
          else if (res.status === 'failed') failed += 1;
          else if (res.status === 'cached') fromCache += 1;
          else built += 1;
          items.push({
            objectId: row.id,
            objectName: row.name,
            municipalityName: facts.municipalityName,
            status: res.status,
            durations: res.result.zones.map((z) => z.durationSec),
            note: res.result.note,
          });
        } catch (err) {
          failed += 1;
          items.push({
            objectId: row.id,
            objectName: row.name,
            municipalityName: null,
            status: 'failed',
            durations: [],
            note: err instanceof Error ? err.message : 'неизвестная ошибка',
          });
        }
      }
    });
    await Promise.all(workers);
    items.sort((a, b) => a.objectName.localeCompare(b.objectName, 'ru'));

    return {
      requested: rows.length,
      built,
      fromCache,
      failed,
      skippedNoGeometry: skipped,
      allowApproximate: dto.approximateAllowed,
      durations: request.durations,
      reverse: request.reverse,
      transport: request.transport,
      items,
      isMock: this.isMockZones,
      note:
        withoutGeometry > 0
          ? `Объектов без точного местоположения в выборке: ${withoutGeometry}. ` +
            (dto.approximateAllowed
              ? 'Включены в расчёт от центроида МО (приближённая геометрия помечена).'
              : 'Исключены из расчёта (§6.3 п.7) — включите «приближённая геометрия» для оценки.')
          : null,
    };
  }

  /** Сводное покрытие и «белые пятна» — только из кэша, без вызовов API (§4.2). */
  async coverage(dto: CoverageQueryDto): Promise<CoverageResult> {
    const filters = this.selectionFilters(dto);
    const counters = this.selectionFilters(dto, false);
    const isMock = this.isMockZones;
    const rows = await this.prisma.$queryRaw<CoverageRow[]>`
      WITH sel AS (
        SELECT o.id AS object_id, c.geom
        FROM isochrone_cache c
        JOIN objects o ON o.id = c.object_id
        LEFT JOIN industries i ON i.id = o.industry_id
        LEFT JOIN statuses s ON s.id = o.status_id
        WHERE c.transport = 'walking'
          AND c.duration_sec = ${dto.durationSec}
          AND c.reverse = ${dto.isReverse}
          AND c.is_mock = ${isMock}
          AND c.geom IS NOT NULL
          AND c.expires_at > now()
          AND o.municipality_id IS NOT NULL
          ${filters}
      ),
      uni AS (
        SELECT ST_Union(sel.geom) AS geom, count(DISTINCT sel.object_id)::int AS objects FROM sel
      )
      SELECT m.id, m.name_short, m.population, m.population_year, m.population_source,
             m.area_km2::text AS area_km2, m.density_per_km2::text AS density_per_km2,
             CASE WHEN uni.geom IS NULL OR ST_IsEmpty(uni.geom) THEN NULL
                  ELSE ST_Area(ST_Intersection(m.geom, uni.geom)::geography) / 1e6 END AS covered_km2,
             CASE WHEN uni.geom IS NULL OR ST_IsEmpty(uni.geom) THEN NULL
                  ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Intersection(m.geom, uni.geom), 0.0008)) END AS covered_json,
             CASE WHEN uni.geom IS NULL OR ST_IsEmpty(uni.geom) THEN NULL
                  ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Difference(m.geom, uni.geom), 0.0008)) END AS white_json,
             (uni.geom IS NOT NULL AND NOT ST_IsEmpty(uni.geom)) AS has_coverage
      FROM municipalities m CROSS JOIN uni
      WHERE m.geom IS NOT NULL
      ORDER BY m.name_short
    `;

    const objectCounts = await this.prisma.$queryRaw<{ with_geom: number; without_geom: number }[]>`
      SELECT count(*) FILTER (WHERE o.geom IS NOT NULL)::int AS with_geom,
             count(*) FILTER (WHERE o.geom IS NULL)::int AS without_geom
      FROM objects o
      LEFT JOIN industries i ON i.id = o.industry_id
      LEFT JOIN statuses s ON s.id = o.status_id
      WHERE TRUE ${counters}
    `;
    const perMuni = await this.prisma.$queryRaw<
      { municipality_id: string; with_geom: number; without_geom: number }[]
    >`
      SELECT o.municipality_id, count(*) FILTER (WHERE o.geom IS NOT NULL)::int AS with_geom,
             count(*) FILTER (WHERE o.geom IS NULL)::int AS without_geom
      FROM objects o
      LEFT JOIN industries i ON i.id = o.industry_id
      LEFT JOIN statuses s ON s.id = o.status_id
      WHERE TRUE ${counters} AND o.municipality_id IS NOT NULL
      GROUP BY o.municipality_id
    `;
    const countsByMuni = new Map(perMuni.map((r) => [r.municipality_id, r]));

    const hasData = rows.some((r) => r.has_coverage === true);
    const coverageFeatures: GeoJsonFeature[] = [];
    const whiteFeatures: GeoJsonFeature[] = [];
    const municipalities: CoverageMunicipalityRow[] = [];

    for (const row of rows) {
      const areaKm2 = toNumber(row.area_km2);
      const coveredKm2 = round3(toNumber(row.covered_km2));
      const density = toNumber(row.density_per_km2);
      const coveredPct =
        areaKm2 !== null && areaKm2 > 0 && coveredKm2 !== null
          ? Math.round((coveredKm2 / areaKm2) * 10000) / 100
          : null;
      const uncoveredKm2 =
        areaKm2 !== null && coveredKm2 !== null ? round3(areaKm2 - coveredKm2) : null;
      const counts = countsByMuni.get(row.id);

      municipalities.push({
        municipalityId: row.id,
        municipalityName: row.name_short,
        areaKm2,
        coveredKm2,
        coveredPct,
        uncoveredKm2,
        populationCovered: coveredKm2 !== null && density !== null ? Math.round(density * coveredKm2) : null,
        populationTotal: row.population,
        populationSource: row.population_source,
        populationYear: row.population_year,
        objectsIncluded: counts?.with_geom ?? 0,
        objectsWithoutGeometry: counts?.without_geom ?? 0,
        hasData: row.has_coverage === true,
        isMock,
      });

      const covered = parseGeometry(row.covered_json);
      if (covered) {
        coverageFeatures.push({
          type: 'Feature',
          id: row.id,
          properties: { municipalityId: row.id, name: row.name_short, coveredKm2, coveredPct, isMock },
          geometry: covered,
        });
      }
      const white = parseGeometry(row.white_json);
      if (white) {
        whiteFeatures.push({
          type: 'Feature',
          id: `${row.id}-white`,
          properties: { municipalityId: row.id, name: row.name_short, uncoveredKm2, isMock },
          geometry: white,
        });
      }
    }

    const totalArea = municipalities.reduce((sum, m) => sum + (m.areaKm2 ?? 0), 0);
    const totalCovered = municipalities.reduce((sum, m) => sum + (m.coveredKm2 ?? 0), 0);

    return {
      sphere: dto.sphere ?? null,
      industryCodes: dto.industry ?? [],
      transport: 'walking',
      durationSec: dto.durationSec,
      reverse: dto.isReverse,
      direction: reverseToDirection(dto.isReverse),
      coverage: hasData ? { type: 'FeatureCollection', features: coverageFeatures } : null,
      whiteSpots: hasData ? { type: 'FeatureCollection', features: whiteFeatures } : null,
      municipalities,
      totals: {
        areaKm2: round3(totalArea),
        coveredKm2: hasData ? round3(totalCovered) : null,
        coveredPct: hasData && totalArea > 0 ? Math.round((totalCovered / totalArea) * 10000) / 100 : null,
        populationCovered: hasData ? municipalities.reduce((sum, m) => sum + (m.populationCovered ?? 0), 0) : null,
        objectsIncluded: objectCounts[0]?.with_geom ?? 0,
        objectsWithoutGeometry: objectCounts[0]?.without_geom ?? 0,
      },
      hasData,
      note: hasData
        ? null
        : 'В кэше нет изохрон под выбранный фильтр: сначала постройте зоны (кнопка «Построить изохроны»). ' +
          'Покрытие и «белые пятна» считаются только по реально рассчитанным зонам (§15.1).',
      isMock,
      disclaimer: this.disclaimer,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * WHERE-фрагмент выборки объектов (сфера/отрасль/МО/статус).
   * `requireGeometry=false` — для счётчиков: объекты без геометрии нужно ПОСЧИТАТЬ,
   * а не отфильтровать (счётчик честности §6.3 п.7).
   */
  private selectionFilters(dto: CoverageQueryDto | BatchIsochroneDto, requireGeometry = true): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (dto.sphere) parts.push(Prisma.sql`AND i.sphere = ${dto.sphere}::"Sphere"`);
    if (dto.industry?.length) parts.push(Prisma.sql`AND i.code = ANY(${dto.industry}::text[])`);
    if (dto.municipality?.length) parts.push(Prisma.sql`AND o.municipality_id = ANY(${dto.municipality}::text[])`);
    if (dto.statusGroup?.length) parts.push(Prisma.sql`AND s.group_code = ANY(${dto.statusGroup}::text[])`);
    // объекты без геометрии не участвуют в расчёте без явного согласия (§6.3 п.7)
    if (requireGeometry && !dto.approximateAllowed) parts.push(Prisma.sql`AND o.geom IS NOT NULL`);
    return parts.length > 0 ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  private async loadObjectFacts(objectId: string): Promise<ObjectFacts> {
    const rows = await this.prisma.$queryRaw<ObjectFactsRow[]>`
      SELECT o.id::text AS id, o.name,
             o.municipality_id,
             m.name_short AS municipality_name,
             m.population, m.population_year, m.population_source,
             m.area_km2::text AS area_km2, m.density_per_km2::text AS density_per_km2,
             i.name AS industry_name, i.sphere::text AS sphere,
             ST_AsGeoJSON(o.geom) AS geom_json,
             ST_AsGeoJSON(m.center) AS center_json
      FROM objects o
      LEFT JOIN municipalities m ON m.id = o.municipality_id
      LEFT JOIN industries i ON i.id = o.industry_id
      WHERE o.id = ${objectId}::uuid
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException(`Объект с id ${objectId} не найден`);
    return {
      id: row.id,
      name: row.name,
      municipalityId: row.municipality_id,
      municipalityName: row.municipality_name,
      industryName: row.industry_name,
      sphere: (row.sphere as SphereCode | null) ?? null,
      point: parsePoint(row.geom_json),
      center: parsePoint(row.center_json),
      population: row.population,
      populationYear: row.population_year,
      populationSource: row.population_source,
      areaKm2: toNumber(row.area_km2),
      densityPerKm2: toNumber(row.density_per_km2),
    };
  }
}
