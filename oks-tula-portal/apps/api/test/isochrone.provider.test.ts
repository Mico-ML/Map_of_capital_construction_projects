import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MockIsochroneProvider,
  DvaGisIsochroneProvider,
  buildModelledZone,
  createIsochroneProvider,
} from '../src/integrations/2gis/isochrone.provider';
import { createPoiProvider, DvaGisPoiProvider, MockPoiProvider } from '../src/integrations/2gis/poi.provider';
import { geoJsonToWkt } from '../src/integrations/2gis/wkt';
import { haversineM, multiPolygonAreaM2, WALKING_SPEED_MPS, type LngLat } from '@oks/shared';

/**
 * Тесты адаптеров 2ГИС (§4.2, §4.4, §10): демо-модель зон, боевой клиент
 * Isochrone API (на образце ответа из документации), Search API с `polygon`
 * и fallback на `point`+`radius`, Categories API. Сеть имитируется —
 * ключи в тестах фиктивные и в код/логи не попадают (§15.11).
 */

const TULA: LngLat = [37.6173, 54.1947];

// Образец ответа Isochrone API из документации 2ГИС (сокращён до 2 зон)
const ISOCHRONE_OK_BODY = {
  isochrones: [
    {
      duration: 900,
      geometry:
        'MULTIPOLYGON(((37.665254 55.751835, 37.666065 55.753546, 37.673251 55.752033, ' +
        '37.672955 55.7566, 37.665254 55.751835)))',
      start_point: { lon: 37.668598, lat: 55.762589 },
      attract_points: [{ lon: 37.668593, lat: 55.762793 }],
    },
    {
      duration: 600,
      geometry: 'MULTIPOLYGON(((37.661787 55.758335, 37.66769 55.760068, 37.661787 55.758335)))',
      start_point: { lon: 37.668598, lat: 55.762589 },
      attract_points: [],
    },
  ],
  format: 'wkt',
  transport: 'walking',
  status: 'OK',
  generation_time: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => impl(String(input), init)));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Демо-модель зоны (isMock)
// ---------------------------------------------------------------------------

describe('buildModelledZone — демо-геометрическая модель (§10, D18)', () => {
  it('детерминирована: одинаковый seed даёт идентичную геометрию', () => {
    const a = buildModelledZone(TULA, 900, 'object-7');
    const b = buildModelledZone(TULA, 900, 'object-7');
    expect(a.coordinates).toEqual(b.coordinates);
  });

  it('разные объекты получают разные зоны (модель не «одна на всех»)', () => {
    const a = buildModelledZone(TULA, 900, 'object-7');
    const b = buildModelledZone(TULA, 900, 'object-55');
    expect(a.coordinates).not.toEqual(b.coordinates);
  });

  it('радиус соответствует времени × скорости пешехода', () => {
    const zone = buildModelledZone(TULA, 600, 'seed', { anisotropy: 0 });
    const area = multiPolygonAreaM2(zone);
    const expected = Math.PI * (600 * WALKING_SPEED_MPS) ** 2;
    // многоугольник 48 лучей вписан в круг: площадь ≥ 99 % круга
    expect(area).toBeGreaterThan(expected * 0.98);
    expect(area).toBeLessThanOrEqual(expected * 1.01);
  });

  it('зона большего времени всегда больше', () => {
    const small = multiPolygonAreaM2(buildModelledZone(TULA, 300, 'seed'));
    const big = multiPolygonAreaM2(buildModelledZone(TULA, 1200, 'seed'));
    expect(big).toBeGreaterThan(small * 10);
  });

  it('кольцо замкнуто и содержит заданное число лучей', () => {
    const zone = buildModelledZone(TULA, 900, 'seed', { rays: 24 });
    const ring = (zone.coordinates as unknown as [number, number][][][])[0][0];
    expect(ring).toHaveLength(25);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('«рельеф» ограничен заданной анизотропией (радиус не уходит в ноль)', () => {
    const anisotropy = 0.9;
    const durationSec = 600;
    const zone = buildModelledZone(TULA, durationSec, 'seed', { anisotropy });
    const ring = (zone.coordinates as unknown as [number, number][][][])[0][0];
    const base = durationSec * WALKING_SPEED_MPS;
    const minR = base * (1 - anisotropy / 2) * 0.98;
    const maxR = base * (1 + anisotropy / 2) * 1.02;
    for (const point of ring) {
      expect(Number.isFinite(point[0]) && Number.isFinite(point[1])).toBe(true);
      const r = haversineM(TULA, point);
      expect(r).toBeGreaterThanOrEqual(minR);
      expect(r).toBeLessThanOrEqual(maxR);
    }
    expect(multiPolygonAreaM2(zone)).toBeGreaterThan(0);
  });

  it('геометрию модели можно передать в Search API: конвертируется в WKT MULTIPOLYGON', () => {
    const zone = buildModelledZone(TULA, 900, 'seed');
    const wkt = geoJsonToWkt(zone);
    expect(wkt).toMatch(/^MULTIPOLYGON\(\(\(/);
  });
});

describe('MockIsochroneProvider', () => {
  it('возвращает зону на каждый промежуток времени с пометкой isMock', async () => {
    const provider = new MockIsochroneProvider();
    const result = await provider.build({
      start: TULA,
      durations: [600, 900],
      reverse: false,
      transport: 'walking',
      seed: 'obj-1',
    });
    expect(result.status).toBe('ok');
    expect(result.isMock).toBe(true);
    expect(result.zones).toHaveLength(2);
    expect(result.zones.map((z) => z.durationSec)).toEqual([600, 900]);
    expect(result.zones.every((z) => z.buildStatus === 'model')).toBe(true);
    expect(result.zones.every((z) => z.geometry !== null)).toBe(true);
    expect(result.note).toMatch(/демо-моделью/i);
  });

  it('при ISOCHRONE_MOCK_GEOMETRY=false геометрию не выдумывает (§15.1)', async () => {
    const provider = new MockIsochroneProvider({ syntheticGeometry: false });
    const result = await provider.build({ start: TULA, durations: [600], reverse: false, transport: 'walking' });
    expect(result.status).toBe('provider_disabled');
    expect(result.zones).toHaveLength(0);
    expect(result.note).toMatch(/ROUTING_API_KEY/);
  });
});

describe('createIsochroneProvider', () => {
  it('по умолчанию — мок', () => {
    expect(createIsochroneProvider({}).kind).toBe('mock');
    expect(createIsochroneProvider({ ISOCHRONE_PROVIDER: 'mock' }).kind).toBe('mock');
  });

  it('live без ключа — явная ошибка конфигурации, а не тихий мок', () => {
    expect(() => createIsochroneProvider({ ISOCHRONE_PROVIDER: 'live' })).toThrow(/ROUTING_API_KEY/);
  });

  it('live с ключом — боевой клиент', () => {
    expect(createIsochroneProvider({ ISOCHRONE_PROVIDER: 'live', ROUTING_API_KEY: 'test' }).kind).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// Боевой клиент Isochrone API
// ---------------------------------------------------------------------------

describe('DvaGisIsochroneProvider (Isochrone API 2ГИС)', () => {
  it('отправляет документированные параметры и разбирает WKT-ответ', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    stubFetch(async (url, init) => {
      capturedUrl = url;
      capturedBody = String(init?.body ?? '');
      return jsonResponse(ISOCHRONE_OK_BODY);
    });

    const provider = new DvaGisIsochroneProvider({ apiKey: 'test-key' });
    const result = await provider.build({
      start: TULA,
      durations: [600, 900],
      reverse: true,
      transport: 'walking',
    });

    expect(result.status).toBe('ok');
    expect(result.isMock).toBe(false);
    expect(result.zones).toHaveLength(2);
    // WKT сохраняется для прямой передачи в Search API (§4.6)
    expect(result.zones[0].wkt).toMatch(/^MULTIPOLYGON/);
    expect(result.zones[0].geometry?.type).toBe('MultiPolygon');
    expect(result.zones[0].startPoint).toEqual([37.668598, 55.762589]);
    expect(result.zones[0].attractPoints).toHaveLength(1);
    expect(result.generationTimeSec).toBe(0);

    // параметры запроса — строго по справочнику API
    const body = JSON.parse(capturedBody) as Record<string, unknown>;
    expect(body).toMatchObject({ start: { lat: TULA[1], lon: TULA[0] }, durations: [600, 900], reverse: true, transport: 'walking' });
    expect(capturedUrl).toContain('routing.api.2gis.com/isochrone/2.0.0');
    expect(capturedUrl).not.toContain('test-key='); // ключ — только значением параметра key
  });

  it('ограничивает запрос 5 промежутками и отбрасывает > 3600 с (§4.2)', async () => {
    let capturedBody = '';
    stubFetch(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return jsonResponse({ ...ISOCHRONE_OK_BODY, isochrones: [] });
    });
    const provider = new DvaGisIsochroneProvider({ apiKey: 'k' });
    await provider.build({
      start: TULA,
      durations: [300, 600, 900, 1200, 1800, 3601, 7200],
      reverse: false,
      transport: 'walking',
    });
    const body = JSON.parse(capturedBody) as { durations: number[] };
    expect(body.durations).toHaveLength(5);
    expect(Math.max(...body.durations)).toBeLessThanOrEqual(3600);
  });

  it('не отправляет запрос при полностью некорректных промежутках', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DvaGisIsochroneProvider({ apiKey: 'k' });
    const result = await provider.build({ start: TULA, durations: [], reverse: false, transport: 'walking' });
    expect(result.status).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP 204 — «зоны не построены», а не ошибка данных', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    const provider = new DvaGisIsochroneProvider({ apiKey: 'k' });
    const result = await provider.build({ start: TULA, durations: [600], reverse: false, transport: 'walking' });
    expect(result.status).toBe('not_found');
    expect(result.zones).toHaveLength(0);
  });

  it('ошибка API не раскрывает ключ в сообщении (§15.11)', async () => {
    stubFetch(async () => jsonResponse({ message: 'invalid key' }, 403));
    const provider = new DvaGisIsochroneProvider({ apiKey: 'super-secret-key' });
    const result = await provider.build({ start: TULA, durations: [600], reverse: false, transport: 'walking' });
    expect(result.status).toBe('error');
    expect(result.note).not.toContain('super-secret-key');
  });

  it('partial_success: посчитанные зоны возвращаются, непостроенные помечены build_error', async () => {
    stubFetch(async () =>
      jsonResponse({
        isochrones: [
          ISOCHRONE_OK_BODY.isochrones[0],
          { duration: 600, status: 'build_error' },
        ],
        format: 'wkt',
        status: 'partial_success',
      }),
    );
    const provider = new DvaGisIsochroneProvider({ apiKey: 'k' });
    const result = await provider.build({ start: TULA, durations: [600, 900], reverse: false, transport: 'walking' });
    expect(result.status).toBe('partial_success');
    const ok = result.zones.find((z) => z.durationSec === 900);
    const failed = result.zones.find((z) => z.durationSec === 600);
    expect(ok?.buildStatus).toBe('OK');
    expect(ok?.geometry).not.toBeNull();
    expect(failed?.buildStatus).toBe('build_error');
    expect(failed?.geometry).toBeNull();
    expect(result.note).toMatch(/1 из 2/);
  });

  it('ретраи с экспоненциальной задержкой на 5xx (макс. 3, §4.5)', async () => {
    const calls: number[] = [];
    stubFetch(async () => {
      calls.push(Date.now());
      return jsonResponse({ error: 'internal' }, 500);
    });
    const provider = new DvaGisIsochroneProvider({ apiKey: 'k' });
    const result = await provider.build({ start: TULA, durations: [600], reverse: false, transport: 'walking' });
    expect(calls).toHaveLength(3);
    expect(result.status).toBe('error');
    expect(result.note).toMatch(/ретраи/);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// Search API: POI внутри изохроны (§4.4, §4.6)
// ---------------------------------------------------------------------------

function smallZone(): ReturnType<typeof buildModelledZone> {
  // зона 10 минут ≈ 1,4 км² — укладывается в лимит polygon (~6 км²)
  return buildModelledZone(TULA, 600, 'seed');
}

function bigZone(): ReturnType<typeof buildModelledZone> {
  // 60 минут ≈ 15 км² — больше лимита polygon → fallback point+radius
  return buildModelledZone(TULA, 3600, 'seed');
}

describe('MockPoiProvider', () => {
  it('не выдумывает объекты каталога (§15.1)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new MockPoiProvider();
    const result = await provider.searchInPolygon({
      polygonWkt: 'MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))',
      geometry: smallZone(),
      sphere: 'education',
      center: TULA,
      maxRadiusM: 700,
    });
    expect(result.status).toBe('provider_mock');
    expect(result.items).toHaveLength(0);
    expect(result.isMock).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('createPoiProvider: live без ключа — ошибка конфигурации', () => {
    expect(createPoiProvider({}).kind).toBe('mock');
    expect(() => createPoiProvider({ POI_PROVIDER: 'live' })).toThrow(/CATALOG_API_KEY/);
    expect(createPoiProvider({ POI_PROVIDER: 'live', CATALOG_API_KEY: 'k' }).kind).toBe('live');
  });
});

describe('DvaGisPoiProvider (Search API 2ГИС)', () => {
  it('передаёт геометрию изохроны параметром polygon напрямую (§4.6)', async () => {
    const urls: string[] = [];
    stubFetch(async (url) => {
      urls.push(url);
      return jsonResponse({
        items: [
          {
            id: '1',
            name: 'Детский сад № 1',
            point: { lat: TULA[1] + 0.001, lon: TULA[0] + 0.001 },
            rubrics: [{ id: 19290, alias: 'detskie_sady', name: 'Детские сады' }],
            purpose_name: 'Детский сад',
            full_address_name: 'Тула, ул. Примерная, 1',
          },
        ],
        total: 1,
      });
    });

    const zone = smallZone();
    const provider = new DvaGisPoiProvider({ apiKey: 'k', regionId: 36 });
    const result = await provider.searchInPolygon({
      polygonWkt: geoJsonToWkt(zone) as string,
      geometry: zone,
      sphere: 'education',
      center: TULA,
      maxRadiusM: 700,
    });

    expect(result.method).toBe('polygon');
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].rubricAliases).toEqual(['detskie_sady']);
    expect(result.items[0].purposeName).toBe('Детский сад');
    expect(result.items[0].address).toBe('Тула, ул. Примерная, 1');
    const first = new URL(urls[0]);
    expect(first.hostname).toBe('catalog.api.2gis.com');
    expect(first.pathname).toBe('/3.0/items');
    expect(first.searchParams.get('region_id')).toBe('36');
    expect(first.searchParams.get('polygon')).toMatch(/^MULTIPOLYGON\(/);
    expect(first.searchParams.get('point')).toBeNull();
    expect(first.searchParams.get('page_size')).toBe('50');
    // по одному запросу на каждую строку конфига рубрик (детский сад + школа)
    expect(urls).toHaveLength(2);
  });

  it('при площади больше ~6 км² — документированный fallback point+radius с постфильтрацией', async () => {
    const urls: string[] = [];
    stubFetch(async (url) => {
      urls.push(url);
      const inside = {
        id: 'in',
        name: 'Школа внутри',
        point: { lat: TULA[1] + 0.002, lon: TULA[0] + 0.002 },
        rubrics: [{ alias: 'shkoly', name: 'Школы' }],
        purpose_name: 'Школа',
      };
      const outside = {
        id: 'out',
        name: 'Школа снаружи',
        point: { lat: TULA[1] + 0.9, lon: TULA[0] + 0.9 },
        rubrics: [{ alias: 'shkoly', name: 'Школы' }],
        purpose_name: 'Школа',
      };
      return jsonResponse({ items: [inside, outside], total: 2 });
    });

    const zone = bigZone();
    const provider = new DvaGisPoiProvider({ apiKey: 'k', regionId: 36 });
    const result = await provider.searchInPolygon({
      polygonWkt: geoJsonToWkt(zone) as string,
      geometry: zone,
      sphere: 'education',
      center: TULA,
      maxRadiusM: 4000,
    });

    expect(result.method).toBe('point_radius');
    const first = new URL(urls[0]);
    expect(first.searchParams.get('polygon')).toBeNull();
    expect(first.searchParams.get('point')).toBe(`${TULA[0]},${TULA[1]}`);
    expect(Number(first.searchParams.get('radius'))).toBeGreaterThan(0);
    // постфильтрация: объект вне полигона отброшен
    expect(result.items.map((i) => i.id)).toEqual(['in']);
    expect(result.note).toMatch(/превышает лимит polygon/);
  });

  it('пагинация останавливается на неполной странице и не превышает лимит страниц', async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `p${calls}-${i}`,
        name: `Объект ${i}`,
        point: { lat: TULA[1], lon: TULA[0] },
        purpose_name: 'Школа',
        rubrics: [{ alias: 'shkoly' }],
      }));
      return jsonResponse({ items, total: 500 });
    });
    const provider = new DvaGisPoiProvider({ apiKey: 'k', regionId: 36, maxPages: 2 });
    const result = await provider.searchInPolygon({
      polygonWkt: geoJsonToWkt(smallZone()) as string,
      geometry: smallZone(),
      sphere: 'education',
      center: TULA,
      maxRadiusM: 700,
    });
    // 2 страницы × 2 строки запроса конфига = 4 обращения к API
    expect(calls).toBe(4);
    expect(result.pagesFetched).toBe(4);
    expect(result.items.length).toBeGreaterThan(50);
    expect(result.total).toBe(500);
  });

  it('meta.code != 200 трактуется как ошибка квоты/доступа', async () => {
    stubFetch(async () => jsonResponse({ meta: { code: 429 }, items: [] }));
    const provider = new DvaGisPoiProvider({ apiKey: 'k' });
    const result = await provider.searchInPolygon({
      polygonWkt: geoJsonToWkt(smallZone()) as string,
      geometry: smallZone(),
      sphere: 'health',
      center: TULA,
      maxRadiusM: 700,
    });
    expect(result.status).toBe('error');
    expect(result.items).toHaveLength(0);
    expect(result.note).toMatch(/meta\.code=429/);
  });

  it('Categories API: разбор рубрик для верификации config/poi_rubrics.ts', async () => {
    let captured = '';
    stubFetch(async (url) => {
      captured = url;
      return jsonResponse({
        meta: { code: 200 },
        result: {
          items: [
            { id: '19290', alias: 'detskie_sady', name: 'Детские сады', parent_id: '2', branch_count: 320 },
          ],
          total: 1,
        },
      });
    });
    const provider = new DvaGisPoiProvider({ apiKey: 'k', regionId: 36 });
    const result = await provider.searchRubrics('детские сады');
    expect(result.status).toBe('ok');
    expect(result.items[0]).toEqual({
      id: 19290,
      alias: 'detskie_sady',
      name: 'Детские сады',
      parentId: 2,
      branchCount: 320,
    });
    expect(captured).toContain('2.0/catalog/rubric/search');
    expect(captured).toContain('region_id=36');
  });
});
