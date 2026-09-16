import { describe, expect, it } from 'vitest';
import {
  ACCESSIBILITY_THRESHOLDS,
  DEFAULT_DURATIONS_SEC,
  DIRECTION_LABELS,
  ISOCHRONE_PRESETS,
  ISOCHRONE_ZONE_STYLES,
  MAX_DURATION_SEC,
  MAX_DURATIONS_PER_REQUEST,
  POI_RUBRICS,
  POI_SPHERES,
  RESIDENTIAL_POI_CONFIG,
  SEARCH_POLYGON_MAX_KM2,
  WALKING_SPEED_MPS,
  classifyPoiItem,
  destinationPoint,
  directionToReverse,
  durationLabelRu,
  estimateWalkMinutes,
  haversineKm,
  haversineM,
  m2ToKm2,
  multiPolygonAreaM2,
  multiPolygonBounds,
  poiConfigFor,
  pointInMultiPolygon,
  pointInPolygon,
  polygonAreaM2,
  reverseToDirection,
  zoneStyle,
  type GeoJsonMultiPolygon,
  type GeoJsonPolygon,
  type LngLat,
} from '../src';

/**
 * Тесты конфигурации и геометрии Ф4 (§7, §15.3): пресеты времени, пороги,
 * палитра зон, рубрики POI и геометрические утилиты, которые используются
 * и бэкендом, и интерфейсом.
 */

const TULA: LngLat = [37.6173, 54.1947];

const square: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [37.6, 55.7],
      [37.7, 55.7],
      [37.7, 55.8],
      [37.6, 55.8],
      [37.6, 55.7],
    ],
  ],
};

const squareWithHole: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [37.6, 55.7],
      [37.7, 55.7],
      [37.7, 55.8],
      [37.6, 55.8],
      [37.6, 55.7],
    ],
    [
      [37.64, 55.74],
      [37.66, 55.74],
      [37.66, 55.76],
      [37.64, 55.76],
      [37.64, 55.74],
    ],
  ],
};

const multi: GeoJsonMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [square.coordinates, [[[38.0, 55.0], [38.1, 55.0], [38.1, 55.1], [38.0, 55.0]]]],
};

describe('конфигурация изохрон (§4.2, §7 Ф4)', () => {
  it('пресеты 5/10/15/20 минут, значения по умолчанию — 10 и 15 минут', () => {
    expect(ISOCHRONE_PRESETS.map((p) => p.durationSec)).toEqual([300, 600, 900, 1200]);
    expect(DEFAULT_DURATIONS_SEC).toEqual([600, 900]);
    expect(ISOCHRONE_PRESETS.every((p) => p.durationSec <= MAX_DURATION_SEC)).toBe(true);
  });

  it('лимиты Isochrone API соответствуют документации (5 промежутков, ≤ 3600 с)', () => {
    expect(MAX_DURATIONS_PER_REQUEST).toBe(5);
    expect(MAX_DURATION_SEC).toBe(3600);
  });

  it('направление ↔ reverse: «к объекту» — это reverse=true', () => {
    expect(directionToReverse('to')).toBe(true);
    expect(directionToReverse('from')).toBe(false);
    expect(reverseToDirection(true)).toBe('to');
    expect(reverseToDirection(false)).toBe('from');
    expect(DIRECTION_LABELS.to.title).toBe('К объекту');
    expect(DIRECTION_LABELS.from.title).toBe('От объекта');
  });

  it('у каждой длительности — свой цвет и подпись (информация не только цветом, §8)', () => {
    for (const preset of ISOCHRONE_PRESETS) {
      const style = ISOCHRONE_ZONE_STYLES[preset.durationSec];
      expect(style).toBeDefined();
      expect(style.fill).toMatch(/^#[0-9A-F]{6}$/i);
      expect(style.stroke).toMatch(/^#[0-9A-F]{6}$/i);
      expect(style.label).toMatch(/минут/);
    }
    // подпись не совпадает у соседних ступеней — различимость в легенде
    expect(new Set(Object.values(ISOCHRONE_ZONE_STYLES).map((s) => s.label)).size).toBe(4);
  });

  it('zoneStyle подбирает ближайший пресет для произвольной длительности', () => {
    expect(zoneStyle(600).label).toBe('10 минут');
    expect(zoneStyle(650).label).toBe('10 минут');
    expect(zoneStyle(3600).label).toBe('20 минут');
    expect(zoneStyle(60).label).toBe('5 минут');
  });

  it('durationLabelRu склоняет минуты по-русски', () => {
    expect(durationLabelRu(300)).toBe('5 минут');
    expect(durationLabelRu(60)).toBe('1 минута');
    expect(durationLabelRu(120)).toBe('2 минуты');
    expect(durationLabelRu(660)).toBe('11 минут');
    expect(durationLabelRu(1260)).toBe('21 минута');
  });

  it('пороги вердикта сконфигурированы и не захардкожены в логике (§15.3)', () => {
    expect(ACCESSIBILITY_THRESHOLDS.peerDuplicateM).toBeLessThan(ACCESSIBILITY_THRESHOLDS.peerFarM);
    expect(ACCESSIBILITY_THRESHOLDS.nearestPeersShown).toBeGreaterThan(0);
    expect(ACCESSIBILITY_THRESHOLDS.minPopulationInZone).toBeGreaterThan(0);
    expect(WALKING_SPEED_MPS).toBeGreaterThan(0.8);
    expect(WALKING_SPEED_MPS).toBeLessThan(1.6);
  });

  it('лимит площади polygon Search API — из документации (~6 км²)', () => {
    expect(SEARCH_POLYGON_MAX_KM2).toBe(6);
  });
});

describe('конфигурация рубрик POI (§4.4)', () => {
  it('все 5 сфер настроены; ID рубрик пустые до верификации рубрикатором', () => {
    expect(POI_SPHERES).toHaveLength(5);
    for (const sphere of POI_SPHERES) {
      const cfg = POI_RUBRICS[sphere];
      expect(cfg.queries.length).toBeGreaterThan(0);
      expect(cfg.rubricQueries.length).toBeGreaterThan(0);
      // честность: alias не выдуман, пока не сверен с Categories API (ROADMAP)
      expect(cfg.rubricIds).toBeNull();
      expect(cfg.aliases).toEqual([]);
      expect(cfg.verifiedAgainstDocs).toBe(false);
    }
  });

  it('жильё ищется как здания (documented-параметр type=building)', () => {
    expect(RESIDENTIAL_POI_CONFIG.itemType).toBe('building');
    expect(poiConfigFor('residential')).toBe(RESIDENTIAL_POI_CONFIG);
    expect(poiConfigFor('education')).toBe(POI_RUBRICS.education);
    expect(POI_RUBRICS.education.itemType).toBeNull();
  });

  it('classifyPoiItem сопоставляет сферу по alias и purpose_name, а не по названию', () => {
    expect(classifyPoiItem({ purposeName: 'Школа', rubricAliases: [] })).toBe('education');
    expect(classifyPoiItem({ purposeName: 'Детский сад' })).toBe('education');
    expect(classifyPoiItem({ purposeName: 'Поликлиника' })).toBe('health');
    expect(classifyPoiItem({ purposeName: 'Бассейн' })).toBe('sport');
    expect(classifyPoiItem({ purposeName: 'Дом культуры' })).toBe('culture');
    expect(classifyPoiItem({ purposeName: 'Жилой дом' })).toBe('residential');
    // название «Школа-магазин» без purpose/alias не классифицируется
    expect(classifyPoiItem({ purposeName: null, rubricAliases: [] })).toBeNull();
  });

  it('alias из рубрикатора имеет приоритет: регистр не важен', () => {
    const configs = {
      ...POI_RUBRICS,
      residential: RESIDENTIAL_POI_CONFIG,
      education: { ...POI_RUBRICS.education, aliases: ['Detskie_Sady'], purposeNames: [], verifiedAgainstDocs: true },
    };
    expect(classifyPoiItem({ rubricAliases: ['detskie_sady'] }, configs)).toBe('education');
  });
});

describe('геометрические утилиты shared', () => {
  it('haversineM: известное расстояние Тула — Москва ≈ 165 км', () => {
    const moscow: LngLat = [37.6173, 55.7558];
    const km = haversineKm(TULA, moscow);
    expect(km).toBeGreaterThan(160);
    expect(km).toBeLessThan(175);
    expect(haversineM(TULA, moscow)).toBeCloseTo(km * 1000, -2);
    expect(haversineM(TULA, TULA)).toBe(0);
  });

  it('estimateWalkMinutes: оценка по скорости пешехода', () => {
    expect(estimateWalkMinutes(660)).toBe(10);
    expect(estimateWalkMinutes(null)).toBeNull();
    expect(estimateWalkMinutes(660, 2)).toBe(5.5);
    expect(estimateWalkMinutes(100, 0)).toBeNull();
  });

  it('площадь полигона: 0,01° × 0,01° на широте Тулы ≈ 0,7 км²', () => {
    const small: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [37.6, 54.19],
          [37.61, 54.19],
          [37.61, 54.2],
          [37.6, 54.2],
          [37.6, 54.19],
        ],
      ],
    };
    const area = polygonAreaM2(small);
    expect(area).toBeGreaterThan(600_000);
    expect(area).toBeLessThan(750_000);
    expect(m2ToKm2(area)).toBeCloseTo(area / 1e6, 3);
    expect(m2ToKm2(null)).toBeNull();
  });

  it('отверстие уменьшает площадь и исключает точку', () => {
    const withHole = polygonAreaM2(squareWithHole);
    expect(withHole).toBeLessThan(polygonAreaM2(square));
    expect(pointInPolygon([37.65, 55.75], squareWithHole)).toBe(false);
    expect(pointInPolygon([37.62, 55.72], squareWithHole)).toBe(true);
    expect(pointInPolygon([37.8, 55.75], squareWithHole)).toBe(false);
  });

  it('MultiPolygon: площадь суммируется, точка ищется по всем частям', () => {
    expect(multiPolygonAreaM2(multi)).toBeGreaterThan(polygonAreaM2(square));
    expect(pointInMultiPolygon([37.65, 55.75], multi)).toBe(true);
    expect(pointInMultiPolygon([38.05, 55.03], multi)).toBe(true);
    expect(pointInMultiPolygon([39, 56], multi)).toBe(false);
    expect(multiPolygonAreaM2({ type: 'MultiPolygon', coordinates: [] })).toBe(0);
  });

  it('multiPolygonBounds — для fitBounds карты', () => {
    const bounds = multiPolygonBounds(multi);
    expect(bounds).toEqual([
      [37.6, 55.0],
      [38.1, 55.8],
    ]);
    expect(multiPolygonBounds({ type: 'MultiPolygon', coordinates: [] })).toBeNull();
  });

  it('destinationPoint: смещение на север/восток и возврат в исходную точку', () => {
    const north = destinationPoint(TULA, 1000, 0);
    expect(north[0]).toBeCloseTo(TULA[0], 6);
    expect(north[1]).toBeGreaterThan(TULA[1]);
    expect(haversineM(TULA, north)).toBeCloseTo(1000, -1);

    const east = destinationPoint(TULA, 1000, 90);
    expect(east[1]).toBeCloseTo(TULA[1], 5);
    expect(east[0]).toBeGreaterThan(TULA[0]);
    expect(haversineM(TULA, east)).toBeCloseTo(1000, -1);

    const back = destinationPoint(north, 1000, 180);
    expect(back[0]).toBeCloseTo(TULA[0], 5);
    expect(back[1]).toBeCloseTo(TULA[1], 5);
  });
});
