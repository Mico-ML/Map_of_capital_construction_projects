import { describe, expect, it } from 'vitest';
import {
  ACCESSIBILITY_THRESHOLDS,
  ISOCHRONE_DISCLAIMER_LIVE,
  ISOCHRONE_DISCLAIMER_MOCK,
  WALKING_SPEED_MPS,
  durationLabelRu,
  m2ToKm2,
  type AccessibilityItem,
  type IsochroneZone,
  type LngLat,
  type SphereCode,
} from '@oks/shared';
import {
  buildAccessibilityReport,
  buildPoiGroups,
  buildRegistryPeers,
  buildVerdict,
  estimatePopulationInZone,
  zoneAreaM2,
  type MunicipalityFacts,
  type RegistryPeer,
} from '../src/modules/isochrone/accessibility';
import type { PoiSearchResult } from '../src/integrations/2gis/types';
import { parseMultiPolygon } from '../src/modules/isochrone/isochrone.service';
import { parseDurations, parseSingleDuration, toList } from '../src/modules/isochrone/dto/isochrone.dto';

/**
 * Тесты расчёта отчёта доступности (§7 Ф4) и разбора параметров запроса.
 * Бизнес-логика отделена от NestJS/Prisma и покрыта unit-тестами (§3, §15.6).
 */

const CENTER: LngLat = [37.6173, 54.1947];
/** Предел выдачи ближайших объектов — значение из конфига (§15.3). */
const NEAREST_PEERS_LIMIT = ACCESSIBILITY_THRESHOLDS.nearestPeersShown;

/** Квадрат ~1,1 × 1,1 км вокруг центра (площадь ≈ 1,2 км²). */
function squareZone(center: LngLat, halfMeters = 550): IsochroneZone {
  const dLat = halfMeters / 111_320;
  const dLon = halfMeters / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  const ring: [number, number][] = [
    [center[0] - dLon, center[1] - dLat],
    [center[0] + dLon, center[1] - dLat],
    [center[0] + dLon, center[1] + dLat],
    [center[0] - dLon, center[1] + dLat],
    [center[0] - dLon, center[1] - dLat],
  ];
  return {
    durationSec: 900,
    durationLabel: durationLabelRu(900),
    geometry: { type: 'MultiPolygon', coordinates: [[ring]] as unknown as number[][][][] },
    areaM2: null,
    source: 'api',
    isMock: false,
    generatedAt: '2026-09-13T10:00:00.000Z',
    expiresAt: '2026-10-13T10:00:00.000Z',
    buildStatus: 'OK',
  };
}

function shift(center: LngLat, metersEast: number, metersNorth = 0): LngLat {
  return [
    center[0] + metersEast / (111_320 * Math.cos((center[1] * Math.PI) / 180)),
    center[1] + metersNorth / 111_320,
  ];
}

function municipality(overrides: Partial<MunicipalityFacts> = {}): MunicipalityFacts {
  return {
    population: 100_000,
    areaKm2: 100,
    densityPerKm2: 1000,
    populationSource: 'Росстат, оценка на 01.01.2025 (демо-данные)',
    populationYear: 2025,
    populationIsMock: true,
    ...overrides,
  };
}

function peer(id: string, point: LngLat, sphere: SphereCode = 'education', name = `Объект ${id}`): RegistryPeer {
  return { id, name, sphere, point, municipalityId: 'tula', statusName: 'Введен в эксплуатацию' };
}

/** Элемент «объект той же сферы» для проверки вердикта. */
function peerItem(id: string, metersEast: number, sphere: SphereCode, name = `Объект ${id}`): AccessibilityItem {
  return {
    id,
    name,
    sphere,
    origin: 'registry',
    point: shift(CENTER, metersEast),
    address: null,
    distanceM: metersEast,
    walkMinutes: Math.round((metersEast / WALKING_SPEED_MPS / 60) * 10) / 10,
    insideZone: metersEast <= 500,
    rubricAliases: [],
    purposeName: null,
    registryObjectId: id,
    statusName: 'Введен в эксплуатацию',
    isMock: false,
  };
}

function poiMock(sphere: SphereCode | 'residential'): PoiSearchResult {
  return {
    status: 'provider_mock',
    items: [],
    total: null,
    sphere,
    method: 'none',
    queries: [],
    pagesFetched: 0,
    isMock: true,
    note: 'демо-режим',
  };
}

function poiLive(sphere: SphereCode | 'residential', ids: string[]): PoiSearchResult {
  return {
    status: ids.length > 0 ? 'ok' : 'empty',
    items: ids.map((id, i) => ({
      id,
      name: `POI ${id}`,
      point: shift(CENTER, 100 + i * 50),
      address: `Тула, ул. Тестовая, ${i + 1}`,
      rubricAliases: sphere === 'residential' ? ['zhilye_doma'] : ['shkoly'],
      rubricNames: [],
      purposeName: sphere === 'residential' ? 'Жилой дом' : 'Школа',
    })),
    total: ids.length,
    sphere,
    method: 'polygon',
    queries: ['школа'],
    pagesFetched: 1,
    isMock: false,
    note: null,
  };
}

// ---------------------------------------------------------------------------

describe('zoneAreaM2', () => {
  it('считает площадь по геометрии, если в кэше её нет', () => {
    const zone = squareZone(CENTER, 500);
    const area = zoneAreaM2(zone);
    expect(area).not.toBeNull();
    // квадрат 1000 × 1000 м ≈ 1 км²
    expect(m2ToKm2(area)).toBeGreaterThan(0.95);
    expect(m2ToKm2(area)).toBeLessThan(1.05);
  });

  it('приоритет — площадь из PostGIS (ST_Area)', () => {
    const zone: IsochroneZone = { ...squareZone(CENTER), areaM2: 123_456 };
    expect(zoneAreaM2(zone)).toBe(123_456);
  });

  it('без зоны — null (в UI «Нет данных»)', () => {
    expect(zoneAreaM2(null)).toBeNull();
  });
});

describe('estimatePopulationInZone', () => {
  it('плотность МО × площадь зоны, с источником и пометкой демо-данных', () => {
    const metric = estimatePopulationInZone(1.2, municipality({ densityPerKm2: 1000 }));
    expect(metric.value).toBe(1200);
    expect(metric.method).toMatch(/плотность населения МО/);
    expect(metric.source).toMatch(/2025/);
    expect(metric.isMock).toBe(true);
    expect(metric.gapReason).toBeNull();
  });

  it('без плотности/площади — null и причина пропуска', () => {
    expect(estimatePopulationInZone(null, municipality()).value).toBeNull();
    const noDensity = estimatePopulationInZone(1.2, municipality({ densityPerKm2: null }));
    expect(noDensity.value).toBeNull();
    expect(noDensity.gapReason).toBe('no_data');
    expect(estimatePopulationInZone(1.2, null).value).toBeNull();
  });

  it('боевое население не помечается как демо', () => {
    const metric = estimatePopulationInZone(2, municipality({ populationIsMock: false, populationSource: 'Росстат' }));
    expect(metric.isMock).toBe(false);
  });
});

describe('buildPoiGroups', () => {
  it('в демо-режиме POI нет: count=null + причина provider_mock (не выдумываем, §15.1)', () => {
    const groups = buildPoiGroups([poiMock('education'), poiMock('residential')], CENTER, squareZone(CENTER), 'mock');
    const education = groups.find((g) => g.sphere === 'education');
    expect(education?.count).toBeNull();
    expect(education?.gapReason).toBe('provider_mock');
    expect(education?.items).toHaveLength(0);
    expect(education?.isMock).toBe(true);
  });

  it('в боевом режиме считает объекты, расстояние и попадание в зону', () => {
    const zone = squareZone(CENTER, 550);
    const groups = buildPoiGroups([poiLive('education', ['a', 'b'])], CENTER, zone, 'live');
    const education = groups.find((g) => g.sphere === 'education');
    expect(education?.count).toBe(2);
    expect(education?.gapReason).toBeNull();
    expect(education?.items[0].distanceM).toBeGreaterThan(90);
    expect(education?.items[0].insideZone).toBe(true);
    expect(education?.matchedBy.join(' ')).toMatch(/q=«школа»/);
    expect(education?.source).toMatch(/polygon/);
  });

  it('боевой провайдер: не запрошенные сферы помечаются not_calculated, а не нулём', () => {
    const groups = buildPoiGroups([poiLive('education', ['a'])], CENTER, squareZone(CENTER), 'live');
    const sport = groups.find((g) => g.sphere === 'sport');
    expect(sport?.count).toBeNull();
    expect(sport?.gapReason).toBe('not_calculated');
  });

  it('время пешком оценивается по скорости из конфига', () => {
    const zone = squareZone(CENTER, 550);
    const groups = buildPoiGroups([poiLive('education', ['a'])], CENTER, zone, 'live');
    const item = groups[0].items[0];
    expect(item.walkMinutes).toBeCloseTo((item.distanceM as number) / WALKING_SPEED_MPS / 60, 0);
  });
});

describe('buildRegistryPeers', () => {
  it('делит объекты той же сферы на «в зоне» и «вне зоны», сортирует по расстоянию', () => {
    const zone = squareZone(CENTER, 500);
    const peers = [
      peer('far', shift(CENTER, 3000)),
      peer('inside-1', shift(CENTER, 200)),
      peer('inside-2', shift(CENTER, -400)),
      peer('near', shift(CENTER, 900)),
    ];
    const { inside, nearest } = buildRegistryPeers(peers, CENTER, zone);
    expect(inside.map((p) => p.id)).toEqual(['inside-1', 'inside-2']);
    expect(nearest.map((p) => p.id)).toEqual(['near', 'far']);
    expect(inside.every((p) => p.origin === 'registry')).toBe(true);
    expect(inside[0].registryObjectId).toBe('inside-1');
    expect(inside[0].isMock).toBe(false);
  });

  it('ограничивает число ближайших объектов значением конфига', () => {
    const zone = squareZone(CENTER, 500);
    const peers = Array.from({ length: 12 }, (_, i) => peer(`p${i}`, shift(CENTER, 1000 + i * 100)));
    const { nearest } = buildRegistryPeers(peers, CENTER, zone);
    expect(NEAREST_PEERS_LIMIT).toBeGreaterThan(0);
    expect(nearest).toHaveLength(NEAREST_PEERS_LIMIT);
  });

  it('без зоны все объекты считаются «вне зоны»', () => {
    const { inside, nearest } = buildRegistryPeers([peer('a', shift(CENTER, 100))], CENTER, null);
    expect(inside).toHaveLength(0);
    expect(nearest).toHaveLength(1);
  });
});

describe('buildVerdict (§7 Ф4)', () => {
  const population = estimatePopulationInZone(1.2, municipality({ densityPerKm2: 5000 }));
  // население из боевого источника — для проверки «высокой» достоверности вердикта
  const populationLive = estimatePopulationInZone(
    1.2,
    municipality({ densityPerKm2: 5000, populationIsMock: false, populationSource: 'Росстат, 2025' }),
  );
  const residential = estimatePopulationInZone(null, null);

  it('«дублирует»: объект той же сферы в зоне ближе порога', () => {
    const verdict = buildVerdict({
      zone: squareZone(CENTER, 500),
      sphere: 'education',
      municipalityName: 'г. Тула',
      insidePeers: [peerItem('x', 300, 'education', 'Школа № 1')],
      nearestPeers: [],
      population,
      residential,
      poiProviderKind: 'mock',
      isochroneIsMock: false,
    });
    expect(verdict.code).toBe('duplicates');
    expect(verdict.title).toMatch(/дублирование/i);
    expect(verdict.explanation).toMatch(/Школа № 1/);
    expect(verdict.basis.join(' ')).toMatch(/300 м/);
  });

  it('«закрывает дефицит»: жителей достаточно, ближайший объект сферы далеко', () => {
    const verdict = buildVerdict({
      zone: squareZone(CENTER, 500),
      sphere: 'health',
      municipalityName: 'Заокский',
      insidePeers: [],
      nearestPeers: [{ ...peerItem('y', 4000, 'health'), insideZone: false }],
      population: populationLive,
      residential,
      poiProviderKind: 'live',
      isochroneIsMock: false,
    });
    expect(verdict.code).toBe('closes_deficit');
    expect(verdict.title).toMatch(/Заокский/);
    expect(verdict.confidence).toBe('high');
  });

  it('«улучшает доступность», если соседний объект рядом, но не в пороге дублирования', () => {
    const verdict = buildVerdict({
      zone: squareZone(CENTER, 500),
      sphere: 'sport',
      municipalityName: 'г. Тула',
      insidePeers: [],
      nearestPeers: [{ ...peerItem('z', 800, 'sport'), insideZone: false }],
      population,
      residential,
      poiProviderKind: 'mock',
      isochroneIsMock: false,
    });
    expect(verdict.code).toBe('improves');
    expect(verdict.confidence).toBe('medium');
  });

  it('без зоны вердикт не выдаётся — «нет данных» (§15.1)', () => {
    const verdict = buildVerdict({
      zone: null,
      sphere: 'education',
      municipalityName: null,
      insidePeers: [],
      nearestPeers: [],
      population,
      residential,
      poiProviderKind: 'mock',
      isochroneIsMock: true,
    });
    expect(verdict.code).toBe('insufficient_data');
    expect(verdict.confidence).toBe('low');
  });

  it('демо-зона понижает достоверность вердикта до low', () => {
    const verdict = buildVerdict({
      zone: { ...squareZone(CENTER, 500), isMock: true, source: 'model' },
      sphere: 'education',
      municipalityName: 'г. Тула',
      insidePeers: [],
      nearestPeers: [],
      population,
      residential,
      poiProviderKind: 'live',
      isochroneIsMock: true,
    });
    expect(verdict.confidence).toBe('low');
  });
});

describe('buildAccessibilityReport', () => {
  const baseInput = {
    object: {
      id: 'obj-1',
      name: 'Школа на 1100 мест',
      sphere: 'education' as SphereCode | null,
      industryName: 'Образование',
      municipalityId: 'tula',
      municipalityName: 'г. Тула',
      point: CENTER,
    },
    reverse: true,
    municipality: municipality(),
    poiProviderKind: 'mock' as const,
    generatedAt: '2026-09-13T12:00:00.000Z',
  };

  it('в демо-режиме: зона есть, POI — «Нет данных», население — оценка с пометкой', () => {
    const zone: IsochroneZone = { ...squareZone(CENTER, 500), isMock: true, source: 'model' };
    const report = buildAccessibilityReport({
      ...baseInput,
      zone,
      poiResults: [poiMock('education'), poiMock('residential')],
      peers: [peer('p1', shift(CENTER, 2000))],
    });
    expect(report.isMock).toBe(true);
    expect(report.disclaimer).toBe(ISOCHRONE_DISCLAIMER_MOCK);
    expect(report.zoneAreaKm2).toBeGreaterThan(0.9);
    expect(report.population.value).toBeGreaterThan(0);
    expect(report.population.isMock).toBe(true);
    expect(report.residentialBuildings.value).toBeNull();
    expect(report.residentialBuildings.gapReason).toBe('provider_mock');
    expect(report.poiTotal).toBeNull();
    expect(report.verdict.code).not.toBe('insufficient_data');
    expect(report.methodology.length).toBeGreaterThanOrEqual(6);
    expect(report.methodology.join(' ')).toMatch(/Routing API/);
    expect(report.sameSphere.inside).toHaveLength(0);
    expect(report.sameSphere.nearest).toHaveLength(1);
    expect(report.sameSphere.registryTotalInMunicipality).toBe(1);
    expect(report.direction).toBe('to');
  });

  it('в боевом режиме: POI подсчитаны, дисклеймер — про пешеходную сеть 2ГИС', () => {
    const zone = squareZone(CENTER, 500);
    const report = buildAccessibilityReport({
      ...baseInput,
      zone,
      poiProviderKind: 'live',
      poiResults: [poiLive('education', ['a', 'b', 'c']), poiLive('residential', ['h1', 'h2'])],
      peers: [],
    });
    expect(report.disclaimer).toBe(ISOCHRONE_DISCLAIMER_LIVE);
    expect(report.poiTotal).toBe(3);
    expect(report.residentialBuildings.value).toBe(2);
    const education = report.poi.find((g) => g.sphere === 'education');
    expect(education?.count).toBe(3);
    expect(report.isMock).toBe(false);
  });

  it('без зоны: вердикт «нет данных», показатели пустые, структура ответа сохранена', () => {
    const report = buildAccessibilityReport({ ...baseInput, zone: null, poiResults: [], peers: [] });
    expect(report.zone).toBeNull();
    expect(report.verdict.code).toBe('insufficient_data');
    expect(report.population.value).toBeNull();
    expect(report.poiTotal).toBeNull();
    expect(report.zoneAreaKm2).toBeNull();
  });

  it('объекты другой сферы не попадают в блок «той же сферы»', () => {
    const report = buildAccessibilityReport({
      ...baseInput,
      zone: squareZone(CENTER, 500),
      poiResults: [poiMock('education'), poiMock('residential')],
      peers: [peer('h', shift(CENTER, 100), 'health'), peer('e', shift(CENTER, 100), 'education')],
    });
    expect(report.sameSphere.inside.map((p) => p.id)).toEqual(['e']);
  });

  it('для объекта вне 5 сфер вердикт строится без сопоставления сферы', () => {
    const report = buildAccessibilityReport({
      ...baseInput,
      object: { ...baseInput.object, sphere: null, industryName: 'Строительство' },
      zone: squareZone(CENTER, 500),
      poiResults: [poiMock('education'), poiMock('health'), poiMock('residential')],
      peers: [],
    });
    expect(report.sphere).toBeNull();
    expect(report.verdict.code).toBe('improves');
    expect(report.sameSphere.inside).toHaveLength(0);
  });
});

describe('parseMultiPolygon (ST_AsGeoJSON → GeoJSON)', () => {
  it('Polygon нормализуется в MultiPolygon', () => {
    const parsed = parseMultiPolygon(
      JSON.stringify({ type: 'Polygon', coordinates: [[[37.6, 55.7], [37.7, 55.7], [37.7, 55.8], [37.6, 55.7]]] }),
    );
    expect(parsed?.type).toBe('MultiPolygon');
    expect(parsed?.coordinates as unknown as number[][][][]).toHaveLength(1);
  });

  it('MultiPolygon возвращается как есть', () => {
    const coords = [[[[37.6, 55.7], [37.7, 55.7], [37.7, 55.8], [37.6, 55.7]]]];
    const parsed = parseMultiPolygon(JSON.stringify({ type: 'MultiPolygon', coordinates: coords }));
    expect(parsed?.coordinates).toEqual(coords);
  });

  it('мусор и null → null', () => {
    expect(parseMultiPolygon(null)).toBeNull();
    expect(parseMultiPolygon('{')).toBeNull();
    expect(parseMultiPolygon(JSON.stringify({ type: 'Point', coordinates: [1, 2] }))).toBeNull();
  });
});

describe('разбор query-параметров Ф4 (§4.2: до 5 промежутков, ≤ 3600 с)', () => {
  it('строка через запятую и массив дают одинаковый результат', () => {
    expect(parseDurations('600,900')).toEqual([600, 900]);
    expect(parseDurations(['600', '900'])).toEqual([600, 900]);
  });

  it('отбрасывает значения вне диапазона, дубликаты и мусор, ограничивает пятью', () => {
    expect(parseDurations('600,600,abc,,900')).toEqual([600, 900]);
    expect(parseDurations('10,3601,60000')).toEqual([]);
    expect(parseDurations('60,120,300,600,900,1200,3600')).toEqual([60, 120, 300, 600, 900]);
    expect(parseDurations('3600')).toEqual([3600]);
  });

  it('parseSingleDuration: значение или дефолт', () => {
    expect(parseSingleDuration('300', 900)).toBe(300);
    expect(parseSingleDuration(undefined, 900)).toBe(900);
    expect(parseSingleDuration('garbage', 900)).toBe(900);
  });

  it('toList: повтор параметра и список через запятую', () => {
    expect(toList('a,b')).toEqual(['a', 'b']);
    expect(toList(['a', 'b'])).toEqual(['a', 'b']);
    expect(toList(undefined)).toEqual([]);
  });
});
