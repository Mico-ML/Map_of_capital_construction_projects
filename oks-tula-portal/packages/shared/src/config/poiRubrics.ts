import type { SphereCode } from '../types/domain';

/**
 * Конфигурация рубрикаторов POI 2ГИС для подсчёта социальных объектов внутри
 * изохрон (§4.4, §7 Ф4). Сопоставление сфер — по `items.rubrics[].alias` и
 * `items.purpose_name` (§4.6), а НЕ по тексту названий.
 *
 * Порядок боевого использования (задокументирован в docs/INTEGRATIONS.md):
 * 1. `GET /api/v1/geo/rubrics?q=<rubricQuery>` (прокси Categories API
 *    `2.0/catalog/rubric/search`, требует CATALOG_API_KEY) → получаем
 *    реальные `id` и `alias` рубрик региона 36;
 * 2. заполняем `rubricIds` и `aliases` ниже и ставим `verifiedAgainstDocs: true`;
 * 3. Search API вызывается с `rubric_id=<ids>` (точная фильтрация) либо с `q=<query>`
 *    и последующим сопоставлением по `alias`/`purpose_name`.
 *
 * ДО заполнения `rubricIds` поиск идёт по `queries` (параметр `q` — документирован),
 * а результаты дополнительно фильтруются по `aliases`/`purposeNames`, если они заданы.
 * Конкретные значения alias в демо-режиме НЕ выдумываются (§15.1): список пуст,
 * пока не сверен с рубрикатором региона (пункт docs/ROADMAP.md, итерация 4).
 */
export interface PoiRubricConfig {
  /** Поисковые строки для параметра `q` Search API (русские названия категорий). */
  queries: string[];
  /** Строки для запроса к Categories API при верификации рубрик. */
  rubricQueries: string[];
  /** ID рубрик 2ГИС (заполняются после верификации через Categories API). */
  rubricIds: number[] | null;
  /** Алиасы рубрик 2ГИС (`items.rubrics[].alias`), регистронезависимо. */
  aliases: string[];
  /** Значения `items.purpose_name` для дополнительного сопоставления (§4.6). */
  purposeNames: string[];
  /**
   * Ограничение типа объектов в Search API (документированный параметр `type`):
   * `building` — здания (жильё), `branch` — организации, null — без ограничения.
   */
  itemType: 'branch' | 'building' | null;
  /** Признак сверки с актуальным рубрикатором региона. */
  verifiedAgainstDocs: boolean;
}

/** Названия сфер для UI и отчётов. */
export const SPHERE_LABELS: Record<SphereCode | 'residential', string> = {
  education: 'Образование (детсады, школы)',
  health: 'Здравоохранение (поликлиники, амбулатории, стационары)',
  sport: 'Спорт (спортсооружения и площадки)',
  culture: 'Культура (ДК, библиотеки, музеи)',
  energy: 'Энергетика',
  residential: 'Жильё (дома и население — оценка охвата)',
};

export const POI_RUBRICS: Record<SphereCode, PoiRubricConfig> = {
  education: {
    queries: ['детский сад', 'школа'],
    rubricQueries: ['детские сады', 'школы', 'лицеи', 'гимназии'],
    rubricIds: null,
    aliases: [],
    // purpose_name измерен фактически (§4.6): «Школа» и т. п.
    purposeNames: ['Детский сад', 'Школа', 'Лицей', 'Гимназия'],
    itemType: null,
    verifiedAgainstDocs: false,
  },
  health: {
    queries: ['поликлиника', 'больница'],
    rubricQueries: ['поликлиники', 'больницы', 'амбулатории', 'фельдшерские пункты'],
    rubricIds: null,
    aliases: [],
    purposeNames: ['Поликлиника', 'Амбулатория', 'Больница', 'ФАП'],
    itemType: null,
    verifiedAgainstDocs: false,
  },
  sport: {
    queries: ['спортивный комплекс', 'спортплощадка'],
    rubricQueries: ['спортивные комплексы', 'стадионы', 'спортплощадки', 'бассейны'],
    rubricIds: null,
    aliases: [],
    purposeNames: ['Спортивный комплекс', 'Стадион', 'Спортплощадка', 'Бассейн'],
    itemType: null,
    verifiedAgainstDocs: false,
  },
  culture: {
    queries: ['дом культуры', 'библиотека'],
    rubricQueries: ['дома культуры', 'библиотеки', 'музеи', 'клубы'],
    rubricIds: null,
    aliases: [],
    purposeNames: ['Дом культуры', 'Библиотека', 'Музей', 'Клуб'],
    itemType: null,
    verifiedAgainstDocs: false,
  },
  energy: {
    queries: ['котельная', 'электроподстанция'],
    rubricQueries: ['котельные', 'ТЭЦ', 'электроподстанции'],
    rubricIds: null,
    aliases: [],
    purposeNames: ['Котельная', 'ТЭЦ', 'Электроподстанция'],
    itemType: null,
    verifiedAgainstDocs: false,
  },
};

/** Рубрики для оценки охвата населения: жилые дома внутри изохроны (§7 Ф4). */
export const RESIDENTIAL_POI_CONFIG: PoiRubricConfig = {
  queries: ['жилой дом'],
  rubricQueries: ['жилые дома', 'многоквартирные дома'],
  rubricIds: null,
  aliases: [],
  purposeNames: ['Жилой дом', 'Многоквартирный дом'],
  // жилые дома — это здания, а не организации: ограничиваем documented-параметр type
  itemType: 'building',
  verifiedAgainstDocs: false,
};

/** Все сферы, по которым считается POI-снимок (порядок для UI). */
export const POI_SPHERES: SphereCode[] = ['education', 'health', 'sport', 'culture', 'energy'];

/** Сводная таблица «сфера → конфиг рубрик» (включая жильё). */
export function poiConfigFor(sphere: SphereCode | 'residential'): PoiRubricConfig {
  return sphere === 'residential' ? RESIDENTIAL_POI_CONFIG : POI_RUBRICS[sphere];
}

/**
 * Классификация элемента выдачи 2ГИС по сфере (§4.6: по `rubrics[].alias`
 * и `purpose_name`, не по тексту названия). Возвращает null, если совпадений нет.
 */
export function classifyPoiItem(
  item: { rubricAliases?: string[]; purposeName?: string | null },
  configs: Record<SphereCode | 'residential', PoiRubricConfig> = {
    ...POI_RUBRICS,
    residential: RESIDENTIAL_POI_CONFIG,
  },
): SphereCode | 'residential' | null {
  const aliases = (item.rubricAliases ?? []).map((a) => a.trim().toLowerCase());
  const purpose = (item.purposeName ?? '').trim().toLowerCase();
  for (const sphere of [...POI_SPHERES, 'residential'] as (SphereCode | 'residential')[]) {
    const cfg = configs[sphere];
    if (!cfg) continue;
    if (aliases.some((a) => cfg.aliases.map((x) => x.toLowerCase()).includes(a))) return sphere;
    if (purpose && cfg.purposeNames.map((x) => x.toLowerCase()).includes(purpose)) return sphere;
  }
  return null;
}
