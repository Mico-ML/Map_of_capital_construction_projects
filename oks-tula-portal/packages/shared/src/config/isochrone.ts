import type { IsochroneDirection, IsochroneTransport } from '../types/accessibility';

/**
 * Конфигурация зон пешей доступности (§4.2, §7 Ф4).
 * Все числа вынесены сюда (§15.3 — не хардкодить пороги в логике).
 * Значения с пометкой «требует утверждения» согласуются с заказчиком.
 */

/** Endpoint Isochrone API 2ГИС (§4.2, проверен фактически — §4.6). */
export const ISOCHRONE_API_URL = 'https://routing.api.2gis.com/isochrone/2.0.0';
export const ISOCHRONE_API_VERSION = '2.0.0';

/** Endpoint Search API 2ГИС (§4.4). */
export const SEARCH_API_URL = 'https://catalog.api.2gis.com/3.0/items';
/** Categories API — справочник рубрик для верификации алиасов (docs.2gis.com/api/search/categories). */
export const RUBRICS_API_URL = 'https://catalog.api.2gis.com/2.0/catalog/rubric/search';

/** Ограничения Isochrone API (§4.2): до 5 промежутков, каждый ≤ 3600 с. */
export const MAX_DURATIONS_PER_REQUEST = 5;
export const MAX_DURATION_SEC = 3600;
export const MIN_DURATION_SEC = 60;

/** Настраиваемые пресеты 5/10/15/20 минут (§7 Ф4). */
export const ISOCHRONE_PRESETS = [
  { durationSec: 300, label: '5 минут', short: '5 мин' },
  { durationSec: 600, label: '10 минут', short: '10 мин' },
  { durationSec: 900, label: '15 минут', short: '15 мин' },
  { durationSec: 1200, label: '20 минут', short: '20 мин' },
] as const;

/** Значения по умолчанию (§7 Ф4: `durations: [600, 900]`). */
export const DEFAULT_DURATIONS_SEC: number[] = [600, 900];

/** В MVP Ф4 — пешеходная доступность; остальные транспорты API поддерживает (§4.2). */
export const ISOCHRONE_TRANSPORTS: IsochroneTransport[] = ['walking'];
export const DEFAULT_TRANSPORT: IsochroneTransport = 'walking';

/** Уровень детализации полигона (параметр `detailing` 0..1, см. справочник Isochrone API). */
export const ISOCHRONE_DETAILING = 0.5;

/** Таймаут запроса к Isochrone API, мс (§9: расчёт без кэша — таймаут 15 с). */
export const ISOCHRONE_TIMEOUT_MS = 15_000;
/** Таймаут запроса к Search/Categories API, мс. */
export const SEARCH_TIMEOUT_MS = 10_000;
/** Максимум ретраев с экспоненциальной задержкой (§4.5). */
export const MAX_RETRIES = 3;

/** TTL кэша изохрон по умолчанию, суток (§4.5 — 30 суток). */
export const ISOCHRONE_TTL_DAYS_DEFAULT = 30;
/** TTL кэша POI-снимка, суток. */
export const POI_TTL_DAYS_DEFAULT = 30;

/**
 * Ограничения Search API (справочник /3.0/items):
 * `polygon` — WKT, допустимая площадь ~6 км²; `radius` — 0..50000 при наличии `q`;
 * `page_size` — 1..50.
 */
export const SEARCH_POLYGON_MAX_KM2 = 6;
export const SEARCH_RADIUS_MAX_M = 50_000;
export const SEARCH_PAGE_SIZE = 50;
/** Защита квоты: не более N страниц на один запрос рубрики. */
export const SEARCH_MAX_PAGES = 4;

/** Пакетный режим (§7 Ф4): максимум объектов за один вызов и параллелизм. */
export const BATCH_MAX_OBJECTS = 60;
export const BATCH_CONCURRENCY = 4;

/**
 * Скорость пешехода, м/с — для (а) демо-геометрической модели зоны и
 * (б) оценки времени «по прямой» до соседних объектов.
 * Требует утверждения заказчиком (влияет только на оценки, не на данные 2ГИС).
 */
export const WALKING_SPEED_MPS = 1.1;

/** Число лучей демо-модели зоны (360/48 = шаг 7,5°). */
export const MOCK_ZONE_RAYS = 48;
/** Амплитуда «рельефа» демо-модели (0..1): 0 — идеальный круг. */
export const MOCK_ZONE_ANISOTROPY = 0.35;

/**
 * Пороги вердикта отчёта доступности (§7 Ф4). Требуют утверждения заказчиком.
 */
export const ACCESSIBILITY_THRESHOLDS = {
  /** Ближе этого расстояния объект той же сферы считается «дублирующим», м (по прямой). */
  peerDuplicateM: 500,
  /** Дальше этого — «закрывает дефицит» (заметное улучшение доступности), м. */
  peerFarM: 1500,
  /** Сколько ближайших объектов сферы показывать в отчёте. */
  nearestPeersShown: 5,
  /** Минимум жителей в зоне, чтобы вердикт «закрывает дефицит» имел смысл. */
  minPopulationInZone: 300,
} as const;

/** Дисклеймеры (§7 Ф4 — обязательны). */
export const ISOCHRONE_DISCLAIMER_LIVE =
  'Расчёт по пешеходной сети 2ГИС, является оценкой. Зоны не учитывают режим работы объектов, ' +
  'препятствия и фактическое состояние путей.';

export const ISOCHRONE_DISCLAIMER_MOCK =
  'ДЕМО-ДАННЫЕ: зона построена упрощённой геометрической моделью (радиус = время × скорость пешехода ' +
  'с детерминированным «рельефом»), а НЕ по пешеходной сети 2ГИС. Для реального расчёта задайте ' +
  'ROUTING_API_KEY и ISOCHRONE_PROVIDER=live. Не использовать для принятия решений.';

export const ISOCHRONE_DISCLAIMER_UNAVAILABLE =
  'Расчёт зон пешей доступности требует секретный ключ Isochrone API 2ГИС (ROUTING_API_KEY) ' +
  'и ISOCHRONE_PROVIDER=live. Демо-режим геометрию зон не имитирует (ISOCHRONE_MOCK_GEOMETRY=false).';

/** Подписи направлений (§7 Ф4). */
export const DIRECTION_LABELS: Record<IsochroneDirection, { title: string; hint: string }> = {
  from: {
    title: 'От объекта',
    hint: 'Куда можно дойти от объекта за выбранное время (reverse=false).',
  },
  to: {
    title: 'К объекту',
    hint:
      'Откуда жители дойдут до объекта за выбранное время (reverse=true). ' +
      'Основной сценарий для садов, школ и поликлиник (§7 Ф4).',
  },
};

/**
 * Градация зон по времени (§7 Ф4: полупрозрачные полигоны с градацией + легенда).
 * Светло-зелёный → жёлтый → оранжевый → красный: рост времени пути.
 * Подписи дублируют цвет текстом (§8: информация не только цветом).
 */
export const ISOCHRONE_ZONE_STYLES: Record<number, { fill: string; stroke: string; label: string; short: string }> = {
  300: { fill: '#A5D6A7', stroke: '#2E7D32', label: '5 минут', short: '5 мин' },
  600: { fill: '#66BB6A', stroke: '#1B5E20', label: '10 минут', short: '10 мин' },
  900: { fill: '#FFD54F', stroke: '#F57F17', label: '15 минут', short: '15 мин' },
  1200: { fill: '#FF8A65', stroke: '#BF360C', label: '20 минут', short: '20 мин' },
};

/** Стиль зоны для произвольной длительности (берём ближайший пресет). */
export function zoneStyle(durationSec: number): { fill: string; stroke: string; label: string; short: string } {
  const keys = Object.keys(ISOCHRONE_ZONE_STYLES)
    .map(Number)
    .sort((a, b) => Math.abs(a - durationSec) - Math.abs(b - durationSec));
  return ISOCHRONE_ZONE_STYLES[keys[0] ?? 600];
}

/** «600» → «10 минут» (склонение по-русски). */
export function durationLabelRu(durationSec: number): string {
  const minutes = Math.round(durationSec / 60);
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = 'минута';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = 'минуты';
  else form = 'минут';
  return `${minutes} ${form}`;
}

/** direction → reverse (§4.2). */
export function directionToReverse(direction: IsochroneDirection): boolean {
  return direction === 'to';
}

export function reverseToDirection(reverse: boolean): IsochroneDirection {
  return reverse ? 'to' : 'from';
}
