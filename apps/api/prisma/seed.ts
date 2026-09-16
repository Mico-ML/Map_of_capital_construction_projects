/**
 * Seed БД (§2, §6, Приложение C). Идемпотентен: upsert справочников и объектов
 * по уникальным ключам; мок-данные пересоздаются (delete + create).
 * Ручной ввод в админке не затирается: поля, перечисленные в objects.manual_override,
 * исключаются из update-пейлоада (§6.1 п.10).
 *
 * Запуск: npm run db:seed (нужны собранные @oks/shared и @oks/etl + DATABASE_URL).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  PrismaClient,
  Prisma,
  type Ownership,
  type GeocodeSource,
  type GeocodeConfidence,
  type MunicipalitySource,
} from '@prisma/client';
import {
  APPEAL_CATEGORIES,
  CAPACITY_UNITS,
  INDUSTRIES,
  MUNICIPALITIES,
  NORMATIVES,
  STATUSES,
  computeSatisfactionIndex,
  hashStringToSeed,
  mulberry32,
  randInt,
  MOCK_SEED,
  MOCK_PRICE_PER_M2_BY_INDUSTRY,
  MOCK_PRICE_PER_CAPACITY_UNIT,
  MOCK_PRICE_BOUNDS,
  MOCK_DISCLAIMER,
  type GeoJsonFeatureCollection,
  type MunicipalityRef,
} from '@oks/shared';
import {
  REPO_ROOT,
  parseObjectsCsv,
  normalizeObjects,
  loadMunicipalityGeometries,
  createGeocoderProvider,
  runGeocodePipeline,
  type NormalizedObject,
  type ObjectGeocodeResult,
} from '@oks/etl';

const prisma = new PrismaClient();

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${msg}`);
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Словари
// ---------------------------------------------------------------------------

async function seedDictionaries(): Promise<void> {
  for (const s of STATUSES) {
    await prisma.status.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, groupCode: s.group, colorHex: s.colorHex, sortOrder: s.sortOrder },
      update: { name: s.name, groupCode: s.group, colorHex: s.colorHex, sortOrder: s.sortOrder },
    });
  }
  for (const i of INDUSTRIES) {
    await prisma.industry.upsert({
      where: { code: i.code },
      create: { code: i.code, name: i.name, sphere: i.sphere ?? null, sortOrder: i.sortOrder },
      update: { name: i.name, sphere: i.sphere ?? null, sortOrder: i.sortOrder },
    });
  }
  for (const u of CAPACITY_UNITS) {
    await prisma.capacityUnit.upsert({
      where: { code: u.code },
      create: { code: u.code, name: u.name, aliases: u.aliases, sortOrder: u.sortOrder },
      update: { name: u.name, aliases: u.aliases, sortOrder: u.sortOrder },
    });
  }
  for (const c of APPEAL_CATEGORIES) {
    await prisma.appealCategory.upsert({
      where: { code: c.code },
      create: { code: c.code, title: c.title, description: c.description, slaDays: c.slaDays, requiresComment: c.requiresComment },
      update: { title: c.title, description: c.description, slaDays: c.slaDays, requiresComment: c.requiresComment },
    });
  }
  await prisma.normative.deleteMany({});
  for (const n of NORMATIVES) {
    await prisma.normative.create({
      data: {
        sphere: n.sphere,
        name: n.name,
        valuePer1000: n.valuePer1000,
        unit: n.unit,
        source: n.source,
        approvedByCustomer: n.approvedByCustomer,
      },
    });
  }
  log('словари загружены');
}

// ---------------------------------------------------------------------------
// Муниципальные образования
// ---------------------------------------------------------------------------

function loadPopulation(): Map<string, { population: number; year: number; source: string }> {
  const path = resolve(REPO_ROOT, process.env.ETL_POPULATION_CSV ?? 'data/mock/population.csv');
  const map = new Map<string, { population: number; year: number; source: string }>();
  if (!existsSync(path)) {
    log(`population.csv не найден (${path})`);
    return map;
  }
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const cols = line.split(';');
    const id = (cols[0] ?? '').trim();
    if (!id) continue;
    map.set(id, {
      population: Number.parseInt(cols[2] ?? '0', 10),
      year: Number.parseInt(cols[3] ?? '0', 10),
      source: cols[4] ?? 'не указан',
    });
  }
  return map;
}

async function seedMunicipalities(): Promise<void> {
  const geoPath = resolve(REPO_ROOT, process.env.ETL_MUNICIPALITIES_GEOJSON ?? 'data/geo/municipalities.geojson');
  const geojson = JSON.parse(readFileSync(geoPath, 'utf-8')) as GeoJsonFeatureCollection;
  const population = loadPopulation();
  const featureByOsmName = new Map<string, (typeof geojson.features)[number]>();
  for (const f of geojson.features) {
    const name = (f.properties as { name?: string }).name;
    if (name) featureByOsmName.set(name, f);
  }

  for (const m of MUNICIPALITIES as MunicipalityRef[]) {
    const pop = population.get(m.id);
    const density = pop && m.areaKm2 ? Math.round((pop.population / m.areaKm2) * 1000) / 1000 : null;
    const scalar = {
      oktmo: m.oktmo,
      nameShort: m.nameShort,
      nameFull: m.nameFull,
      type: m.type,
      adminCenter: m.adminCenter,
      osmName: m.osmName,
      osmRelationId: m.osmRelationId,
      areaKm2: m.areaKm2,
      population: pop?.population ?? null,
      populationYear: pop?.year ?? null,
      populationSource: pop?.source ?? null,
      densityPerKm2: density,
      geomIsMock: false,
      geomSource: 'OpenStreetMap (ODbL), Overpass API, 13.09.2026',
    };
    await prisma.municipality.upsert({ where: { id: m.id }, create: { id: m.id, ...scalar }, update: scalar });

    const [lon, lat] = m.center;
    await prisma.$executeRaw`
      UPDATE municipalities SET center = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) WHERE id = ${m.id}`;
    const feature = featureByOsmName.get(m.osmName);
    if (feature) {
      const geomJson = JSON.stringify(feature.geometry);
      // ST_Multi: в GeoJSON часть МО — Polygon, а колонка — geometry(MultiPolygon,4326)
      await prisma.$executeRaw`
        UPDATE municipalities SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)) WHERE id = ${m.id}`;
    }
  }
  log(`МО загружено: ${MUNICIPALITIES.length}`);
}

// ---------------------------------------------------------------------------
// Организации и программы
// ---------------------------------------------------------------------------

async function upsertOrganization(type: 'grbs' | 'customer' | 'contractor', name: string): Promise<number | null> {
  if (!name) return null;
  const existing = await prisma.organization.findUnique({
    where: { type_nameNormalized: { type, nameNormalized: name } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.organization.create({ data: { type, nameNormalized: name, nameRaw: name } });
  return created.id;
}

async function upsertProgram(level: 'np_gp' | 'fp', name: string): Promise<number | null> {
  if (!name) return null;
  const existing = await prisma.program.findUnique({
    where: { level_nameNormalized: { level, nameNormalized: name } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.program.create({ data: { level, nameNormalized: name } });
  return created.id;
}

// ---------------------------------------------------------------------------
// Объекты
// ---------------------------------------------------------------------------

function buildTimeline(o: NormalizedObject): { date: string; title: string; type: string }[] {
  const events = [
    { date: o.landTransferDate, title: 'Передача земельного участка', type: 'land_transfer' },
    { date: o.permitDate, title: 'Разрешение на строительство', type: 'permit' },
    { date: o.contractDate, title: 'Заключение контракта', type: 'contract' },
    { date: o.equipmentDate, title: 'Установка технологического оборудования', type: 'equipment' },
    { date: o.hydraulicTestDate, title: 'Гидравлические испытания', type: 'hydraulic_test' },
    { date: o.zosDate, title: 'Заключение о соответствии (ЗОС)', type: 'zos' },
    { date: o.actDate, title: 'Акт ввода в эксплуатацию', type: 'act' },
  ].filter((e): e is { date: string; title: string; type: string } => Boolean(e.date));
  return events.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function stripOverrides(
  data: Prisma.ObjectCreateInput,
  override: Record<string, boolean>,
): Prisma.ObjectUpdateInput {
  const out: Record<string, unknown> = { ...data };
  for (const key of Object.keys(override)) {
    if (override[key]) delete out[key];
  }
  // связи в update-пейлоаде используют те же ключи (connect) — Prisma их принимает
  return out as unknown as Prisma.ObjectUpdateInput;
}

async function seedObjects(
  objects: NormalizedObject[],
  geoResults: ObjectGeocodeResult[],
  maps: { industry: Map<string, number>; status: Map<string, number>; unit: Map<string, number> },
): Promise<void> {
  const geoByRow = new Map(geoResults.map((g) => [g.sourceRowNumber, g]));
  for (const o of objects) {
    const geo = geoByRow.get(o.sourceRowNumber);
    const grbsId = await upsertOrganization('grbs', o.grbsCanonical ?? '');
    const customerId = await upsertOrganization('customer', o.customerCanonical ?? '');
    const contractorId = await upsertOrganization('contractor', o.contractorCanonical ?? '');
    const programNpId = await upsertProgram('np_gp', o.programNpCanonical ?? '');
    const programFpId = await upsertProgram('fp', o.programFpCanonical ?? '');
    const needsModeration =
      o.industryNeedsModeration || (geo?.needsModeration ?? false) || (geo?.municipalityConflict ?? false);

    const data: Prisma.ObjectCreateInput = {
      extId: o.extId,
      sourceRowNumber: o.sourceRowNumber,
      raw: o.raw as Prisma.InputJsonValue,
      sourceFileHash: process.env.ETL_SOURCE_HASH ?? null,
      name: o.name,
      grbs: grbsId ? { connect: { id: grbsId } } : undefined,
      industry: o.industryCode && maps.industry.has(o.industryCode) ? { connect: { id: maps.industry.get(o.industryCode)! } } : undefined,
      status: o.statusCode && maps.status.has(o.statusCode) ? { connect: { id: maps.status.get(o.statusCode)! } } : undefined,
      ownership: o.ownership as Ownership,
      municipality: o.municipalityId ? { connect: { id: o.municipalityId } } : undefined,
      municipalitySource: (o.municipalitySource ?? undefined) as MunicipalitySource | undefined,
      municipalityConfidence: (o.municipalityConfidence ?? undefined) as GeocodeConfidence | undefined,
      municipalityConflict: geo?.municipalityConflict ?? false,
      addressRaw: o.addressRaw,
      addressNormalized: o.addressNormalized,
      geocodeSource: (geo?.geocodeSource ?? undefined) as GeocodeSource | undefined,
      geocodeConfidence: (geo?.geocodeConfidence ?? undefined) as GeocodeConfidence | undefined,
      geocodeCandidates: (geo?.candidates ?? []) as unknown as Prisma.InputJsonValue,
      customer: customerId ? { connect: { id: customerId } } : undefined,
      contractor: contractorId ? { connect: { id: contractorId } } : undefined,
      contractorContractRefs: (o.contractorContractRefs ?? []) as unknown as Prisma.InputJsonValue,
      programNp: programNpId ? { connect: { id: programNpId } } : undefined,
      programFp: programFpId ? { connect: { id: programFpId } } : undefined,
      projectCode: o.projectCode,
      areaM2: o.areaM2,
      capacityValue: o.capacityValue,
      capacityUnit: o.capacityUnitCode && maps.unit.has(o.capacityUnitCode) ? { connect: { id: maps.unit.get(o.capacityUnitCode)! } } : undefined,
      capacityParts: (o.capacityParts ?? []) as unknown as Prisma.InputJsonValue,
      capacityRaw: o.capacityRaw,
      expertise: (o.expertise ?? []) as unknown as Prisma.InputJsonValue,
      yearStart: o.yearStart,
      yearEnd: o.yearEnd,
      constructionPeriod: o.constructionPeriod,
      constructionStage: o.constructionStage,
      landTransferDate: toDate(o.landTransferDate),
      permitDate: toDate(o.permitDate),
      contractDate: toDate(o.contractDate),
      contractPeriodStart: toDate(o.contractPeriod?.start),
      contractPeriodEnd: toDate(o.contractPeriod?.end),
      contractPeriodRaw: o.contractPeriod?.raw ?? null,
      contractPeriodNote: o.contractPeriod?.note ?? null,
      readinessPct: o.readinessPct,
      equipmentDate: toDate(o.equipmentDate),
      hydraulicTestDate: toDate(o.hydraulicTestDate),
      zosDate: toDate(o.zosDate),
      zosNumber: o.zosNumber,
      actDate: toDate(o.actDate),
      actNumber: o.actNumber,
      commissioningYear: o.commissioningYear,
      photoDate: toDate(o.photoDate),
      timeline: buildTimeline(o) as unknown as Prisma.InputJsonValue,
      riskFlags: geo?.municipalityConflict ? ['geometry_municipality_conflict'] : [],
      dataFlags: o.flags,
      needsModeration,
    };

    const existing = await prisma.object.findUnique({ where: { sourceRowNumber: o.sourceRowNumber } });
    const override = (existing?.manualOverride as Record<string, boolean> | null) ?? {};
    const saved = existing
      ? await prisma.object.update({ where: { id: existing.id }, data: stripOverrides(data, override) })
      : await prisma.object.create({ data });

    // геометрия — raw (Unsupported в Prisma); учитываем manual_override.geom
    if (!override['geom']) {
      const lon = geo?.point?.[0];
      const lat = geo?.point?.[1];
      if (lon !== undefined && lat !== undefined) {
        await prisma.$executeRaw`UPDATE objects SET geom = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) WHERE id = ${saved.id}::uuid`;
      } else {
        await prisma.$executeRaw`UPDATE objects SET geom = NULL WHERE id = ${saved.id}::uuid`;
      }
    }
  }
  log(`объектов загружено: ${objects.length}`);
}

// ---------------------------------------------------------------------------
// Мок-данные (Приложение C) — пересоздаются, isMock=true
// ---------------------------------------------------------------------------

async function seedMockContracts(): Promise<void> {
  await prisma.contract.deleteMany({ where: { source: 'mock' } });
  const active = await prisma.object.findMany({
    where: { status: { groupCode: { not: 'completed' } } },
    include: { industry: true, contractor: true, customer: true, capacityUnit: true },
  });
  for (const o of active) {
    const rand = mulberry32(hashStringToSeed(`${MOCK_SEED}:contract:${o.sourceRowNumber}`));
    let price: number;
    if (o.areaM2 && Number(o.areaM2) > 0) {
      const rate = MOCK_PRICE_PER_M2_BY_INDUSTRY[o.industry?.code ?? 'other'] ?? 60_000;
      price = Number(o.areaM2) * rate;
    } else if (o.capacityValue && Number(o.capacityValue) > 0) {
      const rate = MOCK_PRICE_PER_CAPACITY_UNIT[o.capacityUnit?.code ?? 'places'] ?? 1_200_000;
      price = Number(o.capacityValue) * rate;
    } else {
      price = randInt(rand, 5_000_000, 120_000_000);
    }
    price = Math.round((price * (0.85 + rand() * 0.3)) / 1000) * 1000;
    price = Math.min(MOCK_PRICE_BOUNDS.max, Math.max(MOCK_PRICE_BOUNDS.min, price));
    const readiness = o.readinessPct ? Number(o.readinessPct) : 0;
    await prisma.contract.create({
      data: {
        objectId: o.id,
        number: `ДЕМО-${String(o.sourceRowNumber).padStart(3, '0')}/2026`,
        date: o.contractDate,
        price,
        stage: readiness === 0 ? 'проектирование' : readiness < 100 ? 'строительство' : 'завершение',
        status: readiness < 100 ? 'исполняется' : 'исполнен',
        customer: o.customer?.nameNormalized ?? null,
        contractor: o.contractor?.nameNormalized ?? null,
        executionStart: o.contractPeriodStart,
        executionEnd: o.contractPeriodEnd,
        source: 'mock',
        isMock: true,
        raw: { disclaimer: MOCK_DISCLAIMER } as Prisma.InputJsonValue,
      },
    });
  }
  log(`мок-контрактов: ${active.length}`);
}

async function seedMockSatisfaction(): Promise<void> {
  await prisma.citizenSatisfaction.deleteMany({ where: { source: 'mock' } });
  const municipalities = await prisma.municipality.findMany({ select: { id: true, population: true } });
  const industries = await prisma.industry.findMany({ where: { sphere: { not: null } }, select: { id: true, code: true } });
  const now = new Date();
  let rows = 0;
  for (const m of municipalities) {
    for (const ind of industries) {
      for (let k = 23; k >= 0; k -= 1) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        const rand = mulberry32(hashStringToSeed(`${MOCK_SEED}:sat:${m.id}:${ind.code}:${start.toISOString().slice(0, 7)}`));
        const population = m.population ?? 10_000;
        const appealsTotal = randInt(rand, 1, Math.max(3, Math.round(population / 4000)));
        const resolvedShare = 0.5 + rand() * 0.48;
        const appealsPositive = Math.round(appealsTotal * resolvedShare);
        const avgResponseDays = Math.round((4 + rand() * 22) * 10) / 10;
        const overdueCount = Math.round(appealsTotal * rand() * 0.2);
        const repeatRate = Math.round(rand() * 0.25 * 10000) / 10000;
        const index = computeSatisfactionIndex({
          resolvedShare,
          avgResponseDays,
          overdueShare: appealsTotal ? overdueCount / appealsTotal : 0,
          repeatShare: repeatRate,
          appealsTotal,
        });
        await prisma.citizenSatisfaction.create({
          data: {
            municipalityId: m.id,
            industryId: ind.id,
            periodStart: start,
            periodEnd: end,
            appealsTotal,
            appealsPositive,
            appealsNegative: appealsTotal - appealsPositive,
            avgResponseDays,
            overdueCount,
            repeatRate,
            satisfactionIndex: index,
            populationRef: population,
            source: 'mock',
            isMock: true,
            raw: { disclaimer: MOCK_DISCLAIMER } as Prisma.InputJsonValue,
          },
        });
        rows += 1;
      }
    }
  }
  log(`мок-строк удовлетворённости: ${rows}`);
}

async function seedMockCameras(): Promise<void> {
  await prisma.cameraSource.deleteMany({ where: { isMock: true } });
  const manifest = readMediaManifest();
  const idByRow = await objectIdMap();
  if (!manifest || manifest.cameras.length === 0) {
    log('manifest.json камер отсутствует — пропускаю (запустите etl/tools/generate_mock_media.py)');
    return;
  }
  let count = 0;
  for (const c of manifest.cameras) {
    const objectId = idByRow.get(c.sourceRowNumber);
    if (!objectId) continue;
    await prisma.cameraSource.create({
      data: {
        objectId,
        title: c.title,
        type: 'snapshot', // демо-заглушка: статичный кадр с обновляемым таймстемпом (надёжно офлайн)
        url: c.url,
        refreshSec: c.refreshSec ?? 30,
        isActive: true,
        isMock: true,
      },
    });
    count += 1;
  }
  log(`мок-камер: ${count}`);
}

interface MediaManifest {
  generatedAt: string;
  media: {
    sourceRowNumber: number;
    kind: 'before_sat' | 'process_photo' | 'process_video' | 'after_render' | 'document' | 'camera_snapshot';
    takenAt: string;
    url: string;
    year?: number;
    bounds?: { west: number; south: number; east: number; north: number } | null;
    caption?: string;
  }[];
  cameras: { sourceRowNumber: number; title: string; type: string; url: string; refreshSec?: number }[];
}

function readMediaManifest(): MediaManifest | null {
  const path = resolve(REPO_ROOT, 'data/mock/media/manifest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as MediaManifest;
}

async function objectIdMap(): Promise<Map<number, string>> {
  const rows = await prisma.object.findMany({ select: { id: true, sourceRowNumber: true } });
  return new Map(rows.map((r) => [r.sourceRowNumber, r.id]));
}

async function seedMockMedia(): Promise<void> {
  await prisma.mediaAsset.deleteMany({ where: { isMock: true } });
  const manifest = readMediaManifest();
  if (!manifest) {
    log('manifest.json медиа отсутствует — пропускаю (запустите etl/tools/generate_mock_media.py)');
    return;
  }
  const idByRow = await objectIdMap();
  let count = 0;
  for (const m of manifest.media) {
    const objectId = idByRow.get(m.sourceRowNumber);
    if (!objectId) continue;
    await prisma.mediaAsset.create({
      data: {
        objectId,
        kind: m.kind,
        url: m.url,
        storageKey: m.url.replace(/^\//, ''),
        takenAt: toDate(m.takenAt),
        year: m.year ?? null,
        caption: m.caption ?? null,
        license: 'Демо-данные портала (не реальные материалы)',
        bounds: (m.bounds ?? undefined) as Prisma.InputJsonValue | undefined,
        isMock: true,
        uploadedBy: 'system:seed',
      },
    });
    count += 1;
  }
  log(`мок-медиа кадров: ${count}`);
}

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    log('ADMIN_EMAIL/ADMIN_PASSWORD не заданы — администратор не создан');
    return;
  }
  // MVP: SHA-256 (боевой bcrypt/argon2 — этап 2, docs/ROADMAP.md)
  const passwordHash = createHash('sha256').update(password).digest('hex');
  await prisma.user.upsert({
    where: { email },
    create: { role: 'admin', name: 'Администратор портала', email, passwordHash },
    update: { passwordHash },
  });
  log(`администратор: ${email}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const csvPath = resolve(REPO_ROOT, process.env.ETL_SOURCE_FILE ?? 'data/raw/objects.csv');
  const geoPath = resolve(REPO_ROOT, process.env.ETL_MUNICIPALITIES_GEOJSON ?? 'data/geo/municipalities.geojson');
  log(`источник: ${csvPath}`);

  const csvText = readFileSync(csvPath, 'utf-8');
  process.env.ETL_SOURCE_HASH = createHash('sha256').update(csvText).digest('hex');
  const table = parseObjectsCsv(csvText);
  const { objects } = normalizeObjects(table);

  const geojson = JSON.parse(readFileSync(geoPath, 'utf-8')) as GeoJsonFeatureCollection;
  const geometries = loadMunicipalityGeometries(geojson);
  const provider = createGeocoderProvider({
    GEOCODER_PROVIDER: process.env.GEOCODER_PROVIDER ?? 'mock',
    CATALOG_API_KEY: process.env.CATALOG_API_KEY,
  });
  const geoResults = await runGeocodePipeline(objects, provider, geometries);

  await seedDictionaries();
  await seedMunicipalities();

  const maps = {
    industry: new Map((await prisma.industry.findMany()).map((i) => [i.code, i.id])),
    status: new Map((await prisma.status.findMany()).map((s) => [s.code, s.id])),
    unit: new Map((await prisma.capacityUnit.findMany()).map((u) => [u.code, u.id])),
  };

  await seedObjects(objects, geoResults, maps);
  await seedMockContracts();
  await seedMockMedia();
  await seedMockSatisfaction();
  await seedMockCameras();
  await seedAdmin();

  await prisma.auditLog.create({
    data: { actor: 'system:seed', action: 'seed', entity: 'database', diff: { objects: objects.length } },
  });
  log('сидирование завершено');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seed] ошибка', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
