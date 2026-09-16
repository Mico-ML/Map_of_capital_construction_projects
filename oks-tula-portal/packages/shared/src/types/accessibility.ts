/**
 * Контракты зоны пешей доступности и отчёта доступности (§7 Ф4).
 * Единый источник правды для API и UI; все значения, которых нет в данных,
 * приходят как `null` и отображаются «Нет данных» (§15.1).
 */

import type { SphereCode } from './domain';
import type { GeoJsonFeatureCollection, GeoJsonMultiPolygon } from './geo';
import type { LngLat } from './api';

/** Способ передвижения. В MVP Ф4 — только пешком (§4.2). */
export type IsochroneTransport = 'walking';

/**
 * Направление расчёта (§7 Ф4):
 * - `from` — «от объекта» (куда можно дойти), `reverse=false`;
 * - `to` — «к объекту» (откуда жители дойдут), `reverse=true`.
 */
export type IsochroneDirection = 'from' | 'to';

/** Источник геометрии зоны. */
export type IsochroneZoneSource =
  | 'cache' // взято из isochrone_cache (повторный запрос к API запрещён, §4.2)
  | 'api' // свежий ответ Isochrone API 2ГИС
  | 'model'; // демо-модель (ISOCHRONE_PROVIDER=mock) — isMock=true

/** Одна зона доступности (один промежуток времени). */
export interface IsochroneZone {
  durationSec: number;
  /** «10 минут» / «15 минут». */
  durationLabel: string;
  geometry: GeoJsonMultiPolygon;
  /** Площадь зоны, м² (ST_Area по geography) или null, если не вычислена. */
  areaM2: number | null;
  source: IsochroneZoneSource;
  isMock: boolean;
  generatedAt: string;
  expiresAt: string;
  /** Статус построения конкретной изохроны (ответ API: OK/build_error). */
  buildStatus?: 'OK' | 'build_error' | 'model' | null;
}

/** Ответ `GET /objects/{id}/isochrone`. */
export interface IsochroneResult {
  objectId: string;
  objectName: string;
  transport: IsochroneTransport;
  reverse: boolean;
  direction: IsochroneDirection;
  /** Точка, от которой строился расчёт. */
  startPoint: LngLat;
  /** true — точка приближённая (центроид МО), см. §6.3 п.7. */
  locationApproximate: boolean;
  zones: IsochroneZone[];
  /** Режим провайдера: live — Isochrone API 2ГИС, mock — демо-модель/нет данных. */
  provider: 'mock' | 'live';
  isMock: boolean;
  /** false — зоны не построены (нет геометрии, ошибка API, квота). */
  available: boolean;
  /** Код причины, если available=false. */
  unavailableReason?: 'no_geometry' | 'provider_error' | 'quota' | 'not_found' | 'disabled';
  note: string | null;
  /** Обязательный дисклеймер (§7 Ф4). */
  disclaimer: string;
  /** Метрики расхода квот (§4.5): сколько зон взято из кэша/построено сейчас. */
  stats: { fromCache: number; built: number; failed: number };
}

/** Причина отсутствия данных в блоке отчёта. */
export type AccessibilityGapReason =
  | 'provider_mock' // нет CATALOG_API_KEY — POI 2ГИС недоступны
  | 'no_data' // данных нет в принципе
  | 'not_calculated';

/** Числовой показатель отчёта с обязательной атрибуцией источника (§8: честность данных). */
export interface AccessibilityMetric {
  value: number | null;
  unit: string | null;
  /** Как получено значение (формула/источник) — показывается в тултипе. */
  method: string;
  source: string;
  isMock: boolean;
  gapReason?: AccessibilityGapReason | null;
}

/** Найденный объект (POI 2ГИС или объект реестра ОКС) в зоне/рядом с зоной. */
export interface AccessibilityItem {
  id: string;
  name: string;
  sphere: SphereCode | 'residential' | 'other';
  /** Источник: каталог 2ГИС или реестр ОКС (реальные данные). */
  origin: '2gis' | 'registry';
  point: LngLat | null;
  address: string | null;
  /** Расстояние от точки объекта ОКС, м — по прямой (не пешеходный маршрут). */
  distanceM: number | null;
  /** Оценка времени пешком по прямой: distance / WALKING_SPEED_MPS. */
  walkMinutes: number | null;
  insideZone: boolean;
  rubricAliases: string[];
  purposeName: string | null;
  /** Для объектов реестра — ссылка на карточку ОКС. */
  registryObjectId?: string | null;
  statusName?: string | null;
  isMock: boolean;
}

/** Группа POI по сфере (§7 Ф4: сопоставление по rubrics.alias/purpose_name из конфига). */
export interface PoiGroup {
  sphere: SphereCode | 'residential';
  label: string;
  count: number | null;
  isMock: boolean;
  source: string;
  gapReason?: AccessibilityGapReason | null;
  items: AccessibilityItem[];
  /** Рубрики/запросы, по которым считалась группа (прозрачность методики). */
  matchedBy: string[];
}

/** Вердикт отчёта доступности (§7 Ф4). */
export type AccessibilityVerdictCode =
  | 'closes_deficit' // «закрывает дефицит в МО X»
  | 'duplicates' // «дублирует существующий объект»
  | 'improves' // «улучшает доступность»
  | 'insufficient_data';

export interface AccessibilityVerdict {
  code: AccessibilityVerdictCode;
  title: string;
  explanation: string;
  /** Факты, на которых основан вердикт (трассируемость, §15.7). */
  basis: string[];
  /** 'high' — по реальным данным 2ГИС; 'low' — демо-модель/нет POI. */
  confidence: 'high' | 'medium' | 'low';
}

/** Отчёт доступности — `GET /objects/{id}/accessibility-report`. */
export interface AccessibilityReport {
  objectId: string;
  objectName: string;
  municipalityId: string | null;
  municipalityName: string | null;
  sphere: SphereCode | null;
  industryName: string | null;
  transport: IsochroneTransport;
  reverse: boolean;
  direction: IsochroneDirection;
  durationSec: number;
  /** Зона, по которой строился отчёт (null — если не построена). */
  zone: IsochroneZone | null;
  zoneAreaKm2: number | null;
  /** Жители в зоне: плотность МО × площадь зоны (оценка, источник указывается). */
  population: AccessibilityMetric;
  /** Жилые дома в зоне (POI 2ГИС); null — «Нет данных». */
  residentialBuildings: AccessibilityMetric;
  poi: PoiGroup[];
  poiTotal: number | null;
  /** Объекты той же сферы: в зоне (конкуренты) и ближайшие снаружи. */
  sameSphere: {
    inside: AccessibilityItem[];
    nearest: AccessibilityItem[];
    registryTotalInMunicipality: number | null;
  };
  verdict: AccessibilityVerdict;
  /** Пояснение методики для тултипа (§7 Ф4). */
  methodology: string[];
  disclaimer: string;
  provider: 'mock' | 'live';
  isMock: boolean;
  generatedAt: string;
  /** Объектов без точного местоположения в выборке (счётчик честности, §6.3 п.7). */
  approximateLocation: boolean;
}

/** Строка сводного покрытия по МО (пакетный режим Ф4). */
export interface CoverageMunicipalityRow {
  municipalityId: string;
  municipalityName: string;
  areaKm2: number | null;
  coveredKm2: number | null;
  coveredPct: number | null;
  uncoveredKm2: number | null;
  /** Оценка жителей в покрытой зоне: плотность МО × покрытая площадь. */
  populationCovered: number | null;
  populationTotal: number | null;
  populationSource: string | null;
  populationYear: number | null;
  objectsIncluded: number;
  objectsWithoutGeometry: number;
  hasData: boolean;
  isMock: boolean;
}

/** Ответ `GET /isochrone/coverage` — сводная карта покрытия и «белые пятна». */
export interface CoverageResult {
  sphere: SphereCode | null;
  industryCodes: string[];
  transport: IsochroneTransport;
  durationSec: number;
  reverse: boolean;
  direction: IsochroneDirection;
  /** Покрытая территория (упрощённый ST_Union изохрон). */
  coverage: GeoJsonFeatureCollection | null;
  /** «Белые пятна» — части МО вне пешей доступности объектов сферы. */
  whiteSpots: GeoJsonFeatureCollection | null;
  municipalities: CoverageMunicipalityRow[];
  totals: {
    areaKm2: number | null;
    coveredKm2: number | null;
    coveredPct: number | null;
    populationCovered: number | null;
    objectsIncluded: number;
    objectsWithoutGeometry: number;
  };
  /** false — в кэше нет ни одной изохроны под фильтр (честное «нет данных»). */
  hasData: boolean;
  note: string | null;
  isMock: boolean;
  disclaimer: string;
  generatedAt: string;
}

/** Ответ `POST /isochrone/batch` — пакетное построение зон. */
export interface IsochroneBatchResult {
  requested: number;
  built: number;
  fromCache: number;
  failed: number;
  skippedNoGeometry: number;
  /** Разрешено ли использовать приближённую геометрию (центроид МО). */
  allowApproximate: boolean;
  durations: number[];
  reverse: boolean;
  transport: IsochroneTransport;
  items: {
    objectId: string;
    objectName: string;
    municipalityName: string | null;
    status: 'built' | 'cached' | 'failed' | 'skipped_no_geometry';
    durations: number[];
    note: string | null;
  }[];
  isMock: boolean;
  note: string | null;
}

/** Статус интеграций Ф4 — `GET /isochrone/status`. */
export interface IsochroneStatus {
  isochroneProvider: 'mock' | 'live';
  poiProvider: 'mock' | 'live';
  available: boolean;
  syntheticGeometry: boolean;
  presets: { durationSec: number; label: string; short: string }[];
  defaultDurations: number[];
  transports: IsochroneTransport[];
  cacheTtlDays: number;
  poiCacheTtlDays: number;
  cachedZones: number | null;
  quota: { isochroneApiCalls: number; zonesBuilt: number; cacheHits: number; poiApiCalls: number; poiItems: number };
  disclaimer: string;
  note: string;
}
