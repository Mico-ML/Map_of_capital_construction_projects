import type { GeoJsonMultiPolygon, LngLat } from '@oks/shared';
import type { SphereCode } from '@oks/shared';

/**
 * Контракты адаптеров 2ГИС (§10 ТЗ: «мок сейчас — боевое подключение позже»).
 * Провайдер выбирается переменной окружения (`ISOCHRONE_PROVIDER`, `POI_PROVIDER`),
 * мок возвращает структурно идентичные данные с флагом `isMock`.
 * Ключи 2ГИС — только на бэкенде и никогда в логах (§4.5, §15.11).
 */

// ---------------------------------------------------------------------------
// Isochrone API (§4.2)
// ---------------------------------------------------------------------------

export type IsochroneTransportMode = 'walking';

/** Статус результата построения зон (соответствует `status` ответа API + наши коды). */
export type IsochroneProviderStatus =
  | 'ok' // status: "OK"
  | 'partial_success' // status: "partial_success" (detailed_response=true)
  | 'build_error' // status: "build_error"
  | 'not_found' // HTTP 204 — зоны не построены
  | 'provider_mock' // демо-провайдер
  | 'provider_disabled' // демо-геометрия отключена (ISOCHRONE_MOCK_GEOMETRY=false)
  | 'error';

export interface IsochroneRequest {
  /** [lon, lat] точки (GeoJSON-порядок). */
  start: LngLat;
  /** Промежутки времени, с (до 5, каждый ≤ 3600 — §4.2). */
  durations: number[];
  reverse: boolean;
  transport: IsochroneTransportMode;
  /** Идентификатор объекта — seed детерминированной демо-модели. */
  seed?: string;
  /** Уровень детализации полигона 0..1 (параметр `detailing`). */
  detailing?: number;
}

/** Одна зона из ответа API (WKT сохранён для прямой передачи в Search API — §4.6). */
export interface IsochroneZoneRaw {
  durationSec: number;
  /** Исходный WKT из ответа 2ГИС (null для демо-модели — генерируется из GeoJSON). */
  wkt: string | null;
  geometry: GeoJsonMultiPolygon | null;
  startPoint: LngLat | null;
  attractPoints: LngLat[];
  buildStatus: 'OK' | 'build_error' | 'model' | null;
}

export interface IsochroneProviderResult {
  status: IsochroneProviderStatus;
  zones: IsochroneZoneRaw[];
  transport: IsochroneTransportMode;
  /** Время генерации ответа API, с (поле `generation_time`). */
  generationTimeSec: number | null;
  apiVersion: string | null;
  isMock: boolean;
  note: string | null;
}

export interface IsochroneProvider {
  readonly kind: 'mock' | 'live';
  build(request: IsochroneRequest): Promise<IsochroneProviderResult>;
}

// ---------------------------------------------------------------------------
// Search API: POI внутри изохроны (§4.4) и Categories API (рубрики)
// ---------------------------------------------------------------------------

export type PoiSearchStatus = 'ok' | 'empty' | 'provider_mock' | 'quota' | 'error';

export interface PoiSearchItem {
  id: string;
  name: string;
  point: LngLat | null;
  address: string | null;
  /** `items.rubrics[].alias` — основа сопоставления сферы (§4.6). */
  rubricAliases: string[];
  rubricNames: string[];
  /** `items.purpose_name` (назначение здания) — дополнительное сопоставление. */
  purposeName: string | null;
}

export interface PoiSearchRequest {
  /** WKT-геометрия зоны — передаётся в Search API параметром `polygon` напрямую (§4.6). */
  polygonWkt: string;
  /** Та же геометрия в GeoJSON — для постфильтрации при fallback на `point`+`radius`. */
  geometry: GeoJsonMultiPolygon;
  sphere: SphereCode | 'residential';
  /** Центр зоны [lon, lat] — для fallback-запроса `point`+`radius`. */
  center: LngLat;
  /** Максимальное расстояние от центра до границы зоны, м (радиус fallback). */
  maxRadiusM: number;
}

export interface PoiSearchResult {
  status: PoiSearchStatus;
  items: PoiSearchItem[];
  /** Заявленное API общее число объектов (`total`), если известно. */
  total: number | null;
  sphere: SphereCode | 'residential';
  /** Как выполнен запрос: по полигону или окружностью с постфильтрацией. */
  method: 'polygon' | 'point_radius' | 'none';
  /** Использованные параметры (прозрачность методики; ключей здесь нет). */
  queries: string[];
  pagesFetched: number;
  isMock: boolean;
  note: string | null;
}

/** Рубрика из Categories API (`2.0/catalog/rubric/search`). */
export interface RubricItem {
  id: number | null;
  alias: string | null;
  name: string | null;
  parentId: number | null;
  branchCount: number | null;
}

export interface RubricSearchResult {
  status: 'ok' | 'empty' | 'provider_mock' | 'error';
  items: RubricItem[];
  isMock: boolean;
  note: string | null;
}

export interface PoiProvider {
  readonly kind: 'mock' | 'live';
  searchInPolygon(request: PoiSearchRequest): Promise<PoiSearchResult>;
  /** Справочник рубрик — для верификации `config/poi_rubrics.ts` (docs/INTEGRATIONS.md). */
  searchRubrics(query: string): Promise<RubricSearchResult>;
}
