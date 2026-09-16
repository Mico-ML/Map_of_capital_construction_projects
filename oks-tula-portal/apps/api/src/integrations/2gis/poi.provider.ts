import {
  POI_SPHERES,
  REGION_ID,
  RUBRICS_API_URL,
  SEARCH_API_URL,
  SEARCH_MAX_PAGES,
  SEARCH_PAGE_SIZE,
  SEARCH_POLYGON_MAX_KM2,
  SEARCH_RADIUS_MAX_M,
  SEARCH_TIMEOUT_MS,
  MAX_RETRIES,
  classifyPoiItem,
  multiPolygonAreaM2,
  pointInMultiPolygon,
  poiConfigFor,
  type LngLat,
} from '@oks/shared';
import type {
  PoiProvider,
  PoiSearchItem,
  PoiSearchRequest,
  PoiSearchResult,
  RubricItem,
  RubricSearchResult,
} from './types';

/**
 * Адаптеры Search API 2ГИС (§4.4, §7 Ф4) и Categories API (рубрикатор).
 *
 * Проверено документацией (docs.2gis.com/api/search/places/reference/3.0/items):
 *   - `polygon` — WKT (`POLYGON((lon lat,…))` / `MULTIPOLYGON(((lon lat,…)))`),
 *     допустимая площадь ~6 км² → геометрию изохроны передаём НАПРЯМУЮ (§4.6);
 *   - при площади больше лимита — документированный обходной путь: `point`+`radius`
 *     (radius ≤ 50 000 при наличии `q`/`rubric_id`) и постфильтрация попаданием
 *     точки в полигон;
 *   - `page_size` ≤ 50, `page` ≥ 1 — пагинация с ограничением числа страниц
 *     (SEARCH_MAX_PAGES) ради экономии квоты (§4.5);
 *   - `rubric_id` требует `region_id`; `fields` — items.point/items.rubrics/items.address.
 *
 * Сопоставление сфер — по `items.rubrics[].alias` и `items.purpose_name`
 * из конфига `config/poi_rubrics.ts`, а не по тексту названий (§4.6, §7 Ф4).
 */

interface DvaGisRubric {
  id?: number;
  alias?: string;
  name?: string;
  parent_id?: number;
}

interface DvaGisItem {
  id?: string;
  name?: string;
  full_name?: string;
  point?: { lat: number; lon: number };
  address?: { name?: string };
  full_address_name?: string;
  rubrics?: DvaGisRubric[];
  purpose_name?: string;
}

interface DvaGisItemsResponse {
  meta?: { code?: number };
  items?: DvaGisItem[];
  total?: number;
  result?: { items?: DvaGisItem[]; total?: number };
}

interface DvaGisRubricsResponse {
  meta?: { code?: number };
  result?: {
    items?: { id?: string; alias?: string; name?: string; parent_id?: string; branch_count?: number }[];
    total?: number;
  };
}

export interface DvaGisPoiOptions {
  apiKey: string;
  regionId?: number;
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export class MockPoiProvider implements PoiProvider {
  readonly kind = 'mock' as const;

  async searchInPolygon(request: PoiSearchRequest): Promise<PoiSearchResult> {
    return {
      status: 'provider_mock',
      items: [],
      total: null,
      sphere: request.sphere,
      method: 'none',
      queries: [],
      pagesFetched: 0,
      isMock: true,
      note:
        'POI 2ГИС в демо-режиме не запрашиваются (нет CATALOG_API_KEY): объекты каталога не выдумываются. ' +
        'В отчёте доступности используются только реальные данные реестра ОКС и границы МО.',
    };
  }

  async searchRubrics(): Promise<RubricSearchResult> {
    return {
      status: 'provider_mock',
      items: [],
      isMock: true,
      note: 'Рубрикатор доступен только с CATALOG_API_KEY (Categories API, docs.2gis.com/api/search/categories).',
    };
  }
}

export class DvaGisPoiProvider implements PoiProvider {
  readonly kind = 'live' as const;
  private readonly apiKey: string;
  private readonly regionId: number;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly timeoutMs: number;

  constructor(opts: DvaGisPoiOptions) {
    this.apiKey = opts.apiKey;
    this.regionId = opts.regionId ?? REGION_ID;
    this.pageSize = Math.min(opts.pageSize ?? SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE);
    this.maxPages = opts.maxPages ?? SEARCH_MAX_PAGES;
    this.timeoutMs = opts.timeoutMs ?? SEARCH_TIMEOUT_MS;
  }

  async searchInPolygon(request: PoiSearchRequest): Promise<PoiSearchResult> {
    const cfg = poiConfigFor(request.sphere);
    const areaKm2 = multiPolygonAreaM2(request.geometry) / 1e6;
    // Документированное ограничение `polygon` ~6 км²: для больших зон — point+radius
    const usePolygon = areaKm2 <= SEARCH_POLYGON_MAX_KM2;
    const method: PoiSearchResult['method'] = usePolygon ? 'polygon' : 'point_radius';

    const geometryParams: Record<string, string> = usePolygon
      ? { polygon: request.polygonWkt }
      : {
          point: `${request.center[0]},${request.center[1]}`,
          radius: String(Math.min(SEARCH_RADIUS_MAX_M, Math.max(1, Math.ceil(request.maxRadiusM)))),
        };

    const queries = cfg.queries.length > 0 ? cfg.queries : [''];
    const items = new Map<string, PoiSearchItem>();
    let total: number | null = null;
    let pagesFetched = 0;
    let lastNote: string | null = null;
    let lastError = false;

    for (const query of queries) {
      for (let page = 1; page <= this.maxPages; page += 1) {
        const params: Record<string, string> = {
          ...geometryParams,
          region_id: String(this.regionId),
          fields: 'items.point,items.rubrics,items.address,items.full_address_name',
          page_size: String(this.pageSize),
          page: String(page),
          sort: 'name',
        };
        if (query) params.q = query;
        if (cfg.itemType) params.type = cfg.itemType;

        const res = await this.request(params);
        if (res.status === 'error') {
          // ошибка квоты/доступа важнее пустой выдачи — показываем её причиной
          lastNote = res.note;
          lastError = true;
          break;
        }
        pagesFetched += 1;
        if (res.total !== null) total = total === null ? res.total : Math.max(total, res.total);
        for (const item of res.items) {
          if (item.point && !usePolygon && !pointInMultiPolygon(item.point, request.geometry)) continue;
          items.set(item.id, item);
        }
        if (res.items.length < this.pageSize) break;
      }
    }

    // Дополнительная фильтрация по рубрикам/назначению из конфига (§4.6)
    const relevant = [...items.values()].filter((item) => {
      const sphere = classifyPoiItem({
        rubricAliases: item.rubricAliases,
        purposeName: item.purposeName,
      });
      // если рубрикатор ещё не сверен (aliases пустые) — полагаемся на purpose_name/запрос
      return sphere === null ? cfg.aliases.length === 0 : sphere === request.sphere;
    });

    const list = relevant.length > 0 ? relevant : [...items.values()];
    return {
      status: list.length > 0 ? 'ok' : lastError ? 'error' : 'empty',
      items: list,
      total,
      sphere: request.sphere,
      method,
      queries: queries.filter(Boolean),
      pagesFetched,
      isMock: false,
      note:
        (lastError ? lastNote : null) ??
        (method === 'point_radius'
          ? `Площадь зоны ${areaKm2.toFixed(2)} км² превышает лимит polygon (~${SEARCH_POLYGON_MAX_KM2} км²): ` +
            'запрос выполнен point+radius с постфильтрацией по полигону.'
          : null),
    };
  }

  async searchRubrics(query: string): Promise<RubricSearchResult> {
    const search = new URLSearchParams({
      q: query,
      region_id: String(this.regionId),
      key: this.apiKey,
    });
    let lastError: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(`${RUBRICS_API_URL}?${search.toString()}`, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          await backoff(attempt);
          continue;
        }
        if (!response.ok) return { status: 'error', items: [], isMock: false, note: `HTTP ${response.status}` };
        const body = (await response.json()) as DvaGisRubricsResponse;
        const raw = body.result?.items ?? [];
        const items: RubricItem[] = raw.map((r) => ({
          id: r.id ? Number.parseInt(r.id, 10) : null,
          alias: r.alias ?? null,
          name: r.name ?? null,
          parentId: r.parent_id ? Number.parseInt(r.parent_id, 10) : null,
          branchCount: r.branch_count ?? null,
        }));
        return { status: items.length > 0 ? 'ok' : 'empty', items, isMock: false, note: null };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await backoff(attempt);
      }
    }
    return { status: 'error', items: [], isMock: false, note: `исчерпаны ретраи: ${lastError ?? 'неизвестно'}` };
  }

  private async request(
    params: Record<string, string>,
  ): Promise<{ items: PoiSearchItem[]; total: number | null; status: 'ok' | 'empty' | 'error'; note: string | null }> {
    const search = new URLSearchParams({ ...params, key: this.apiKey });
    let lastError: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(`${SEARCH_API_URL}?${search.toString()}`, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          await backoff(attempt);
          continue;
        }
        if (!response.ok) {
          // ключ в сообщение не включаем (§15.11)
          return { items: [], total: null, status: 'error', note: `Search API: HTTP ${response.status}` };
        }
        const body = (await response.json()) as DvaGisItemsResponse;
        if (body.meta?.code !== undefined && body.meta.code !== 200) {
          return { items: [], total: null, status: 'error', note: `Search API: meta.code=${body.meta.code}` };
        }
        const raw = body.items ?? body.result?.items ?? [];
        const total = body.total ?? body.result?.total ?? null;
        return { items: raw.map(mapItem), total, status: raw.length > 0 ? 'ok' : 'empty', note: null };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await backoff(attempt);
      }
    }
    return { items: [], total: null, status: 'error', note: `исчерпаны ретраи: ${lastError ?? 'неизвестно'}` };
  }
}

function mapItem(item: DvaGisItem): PoiSearchItem {
  const point: LngLat | null =
    item.point && Number.isFinite(item.point.lon) && Number.isFinite(item.point.lat)
      ? [item.point.lon, item.point.lat]
      : null;
  return {
    id: String(item.id ?? `${point ? `${point[0]},${point[1]}` : 'unknown'}`),
    name: item.name ?? item.full_name ?? '',
    point,
    address: item.full_address_name ?? item.address?.name ?? null,
    rubricAliases: (item.rubrics ?? []).map((r) => r.alias ?? '').filter(Boolean),
    rubricNames: (item.rubrics ?? []).map((r) => r.name ?? '').filter(Boolean),
    purposeName: item.purpose_name ?? null,
  };
}

async function backoff(attempt: number): Promise<void> {
  const delayMs = 500 * 2 ** attempt;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Фабрика провайдера по переменным окружения (§10). */
export function createPoiProvider(env: {
  POI_PROVIDER?: string;
  CATALOG_API_KEY?: string;
  REGION_ID?: number;
}): PoiProvider {
  if (env.POI_PROVIDER === 'live') {
    if (!env.CATALOG_API_KEY) {
      throw new Error('POI_PROVIDER=live требует CATALOG_API_KEY (см. .env.example)');
    }
    return new DvaGisPoiProvider({ apiKey: env.CATALOG_API_KEY, regionId: env.REGION_ID });
  }
  return new MockPoiProvider();
}

/** Перечень сфер, по которым считается POI-снимок (для сервиса изохрон). */
export { POI_SPHERES };
