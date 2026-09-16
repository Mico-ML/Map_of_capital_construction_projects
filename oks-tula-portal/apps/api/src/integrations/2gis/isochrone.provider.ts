import {
  ISOCHRONE_API_URL,
  ISOCHRONE_API_VERSION,
  ISOCHRONE_DETAILING,
  ISOCHRONE_TIMEOUT_MS,
  MAX_DURATION_SEC,
  MAX_RETRIES,
  MOCK_ZONE_ANISOTROPY,
  MOCK_ZONE_RAYS,
  WALKING_SPEED_MPS,
  destinationPoint,
  hashStringToSeed,
  mulberry32,
  type GeoJsonMultiPolygon,
  type LngLat,
} from '@oks/shared';
import { wktToGeoJson } from './wkt';
import type { IsochroneProvider, IsochroneProviderResult, IsochroneRequest, IsochroneZoneRaw } from './types';

/**
 * Адаптеры Isochrone API 2ГИС (§4.2, §7 Ф4, §10).
 *
 * Боевой клиент: POST https://routing.api.2gis.com/isochrone/2.0.0?key=ROUTING_KEY
 * с телом `{ start:{lat,lon}, durations:[600,900], reverse, transport:"walking",
 * detailing, detailed_response:true }`. Параметры и ответ — по справочнику API
 * (docs.2gis.com/api/navigation/isochrone/reference/isochrone_200): ограничения
 * «до 5 промежутков, каждый ≤ 3600 с», статусы `OK`/`partial_success`/`build_error`,
 * HTTP 204 — зоны не построены, геометрия — WKT MULTIPOLYGON.
 *
 * Демо-клиент (`ISOCHRONE_PROVIDER=mock`): геометрию пешеходной сети 2ГИС
 * неоткуда взять, поэтому зона строится ЯВНОЙ геометрической моделью
 * (радиус = время × скорость пешехода + детерминированный «рельеф» по азимутам)
 * и помечается `isMock=true` во всех ответах и в UI (§10, Приложение C).
 * Модель отключается `ISOCHRONE_MOCK_GEOMETRY=false` — тогда адаптер честно
 * возвращает `provider_disabled`, и интерфейс показывает «Нет данных».
 */

// ---------------------------------------------------------------------------
// Демо-модель зоны
// ---------------------------------------------------------------------------

export interface ModelledZoneOptions {
  speedMps?: number;
  rays?: number;
  anisotropy?: number;
}

/**
 * Детерминированная «радиальная» модель зоны пешей доступности.
 * Не является расчётом по дорожной сети — только демонстрация механики Ф4
 * (см. ISOCHRONE_DISCLAIMER_MOCK и docs/DECISIONS.md D18).
 */
export function buildModelledZone(
  start: LngLat,
  durationSec: number,
  seed: string,
  opts: ModelledZoneOptions = {},
): GeoJsonMultiPolygon {
  const speed = opts.speedMps ?? WALKING_SPEED_MPS;
  const rays = Math.max(8, Math.trunc(opts.rays ?? MOCK_ZONE_RAYS));
  const anisotropy = Math.min(0.9, Math.max(0, opts.anisotropy ?? MOCK_ZONE_ANISOTROPY));
  const baseRadius = Math.max(1, durationSec * speed);

  // Детерминированный «рельеф»: шум по азимутам + сглаживание соседних лучей.
  const rand = mulberry32(hashStringToSeed(`${seed}|${durationSec}|${rays}`));
  const raw: number[] = [];
  for (let i = 0; i < rays; i += 1) raw.push(rand());
  const smoothed = raw.map((_, i) => {
    const prev = raw[(i - 1 + rays) % rays];
    const next = raw[(i + 1) % rays];
    return (prev + raw[i] * 2 + next) / 4;
  });

  const ring: [number, number][] = [];
  for (let i = 0; i < rays; i += 1) {
    const azimuth = (360 / rays) * i;
    const factor = 1 - anisotropy / 2 + anisotropy * smoothed[i];
    const point = destinationPoint(start, baseRadius * factor, azimuth);
    ring.push([Math.round(point[0] * 1e6) / 1e6, Math.round(point[1] * 1e6) / 1e6]);
  }
  ring.push([ring[0][0], ring[0][1]]);

  return { type: 'MultiPolygon', coordinates: [[ring]] as unknown as number[][][][] };
}

export interface MockIsochroneOptions {
  /** false — геометрию не имитируем вовсе (честное «Нет данных»). */
  syntheticGeometry?: boolean;
  speedMps?: number;
}

export class MockIsochroneProvider implements IsochroneProvider {
  readonly kind = 'mock' as const;
  private readonly synthetic: boolean;
  private readonly speedMps: number;

  constructor(opts: MockIsochroneOptions = {}) {
    this.synthetic = opts.syntheticGeometry !== false;
    this.speedMps = opts.speedMps ?? WALKING_SPEED_MPS;
  }

  /** Доступна ли демо-геометрия (для статуса интеграций в UI). */
  get syntheticGeometry(): boolean {
    return this.synthetic;
  }

  async build(request: IsochroneRequest): Promise<IsochroneProviderResult> {
    if (!this.synthetic) {
      return {
        status: 'provider_disabled',
        zones: [],
        transport: 'walking',
        generationTimeSec: null,
        apiVersion: null,
        isMock: true,
        note:
          'Демо-геометрия зон отключена (ISOCHRONE_MOCK_GEOMETRY=false). ' +
          'Для расчёта по пешеходной сети задайте ROUTING_API_KEY и ISOCHRONE_PROVIDER=live.',
      };
    }
    const zones: IsochroneZoneRaw[] = request.durations.map((durationSec) => ({
      durationSec,
      wkt: null,
      geometry: buildModelledZone(request.start, durationSec, request.seed ?? 'unknown', { speedMps: this.speedMps }),
      startPoint: request.start,
      attractPoints: [],
      buildStatus: 'model',
    }));
    return {
      status: 'ok',
      zones,
      transport: 'walking',
      generationTimeSec: null,
      apiVersion: null,
      isMock: true,
      note:
        'Зоны построены демо-моделью (радиус = время × скорость пешехода), а не по пешеходной сети 2ГИС. ' +
        'Помечены isMock=true и бейджем «ДЕМО-ДАННЫЕ» в интерфейсе.',
    };
  }
}

// ---------------------------------------------------------------------------
// Боевой клиент Isochrone API
// ---------------------------------------------------------------------------

interface DvaGisIsochrone {
  duration?: number;
  geometry?: string;
  start_point?: { lon: number; lat: number };
  attract_points?: { lon: number; lat: number }[];
  status?: string;
}

interface DvaGisIsochroneResponse {
  isochrones?: DvaGisIsochrone[];
  format?: string;
  transport?: string;
  status?: string;
  generation_time?: number;
}

export interface DvaGisIsochroneOptions {
  apiKey: string;
  timeoutMs?: number;
  detailing?: number;
}

export class DvaGisIsochroneProvider implements IsochroneProvider {
  readonly kind = 'live' as const;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly detailing: number;

  constructor(opts: DvaGisIsochroneOptions) {
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? ISOCHRONE_TIMEOUT_MS;
    this.detailing = opts.detailing ?? ISOCHRONE_DETAILING;
  }

  async build(request: IsochroneRequest): Promise<IsochroneProviderResult> {
    const durations = request.durations
      .filter((d) => Number.isFinite(d) && d > 0 && d <= MAX_DURATION_SEC)
      .slice(0, 5); // §4.2: до 5 промежутков, каждый ≤ 3600 с
    if (durations.length === 0) {
      return emptyResult('некорректные промежутки времени (нужно 1–5 значений ≤ 3600 с)');
    }

    const body = {
      start: { lat: request.start[1], lon: request.start[0] },
      durations,
      reverse: request.reverse,
      transport: request.transport,
      detailing: this.detailing,
      // при частичном успехе получаем посчитанные зоны и статус каждой, а не пустой 204
      detailed_response: true,
    };

    let lastError: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(`${ISOCHRONE_API_URL}?key=${encodeURIComponent(this.apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          await backoff(attempt);
          continue;
        }
        if (response.status === 204) {
          // «Не найдено»: для точки вне пешеходной сети зон нет — это не ошибка данных
          return emptyResult('Isochrone API не построил зоны для этой точки (HTTP 204)', 'not_found');
        }
        if (!response.ok) {
          // ключ в сообщение не включаем (§15.11)
          return emptyResult(`Isochrone API вернул HTTP ${response.status}`);
        }
        const payload = (await response.json()) as DvaGisIsochroneResponse;
        return this.parse(payload);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await backoff(attempt);
      }
    }
    return emptyResult(`исчерпаны ретраи Isochrone API: ${lastError ?? 'неизвестно'}`);
  }

  private parse(payload: DvaGisIsochroneResponse): IsochroneProviderResult {
    const rawStatus = (payload.status ?? '').toUpperCase();
    const items = payload.isochrones ?? [];
    const zones: IsochroneZoneRaw[] = [];
    let failed = 0;
    for (const item of items) {
      const durationSec = typeof item.duration === 'number' ? item.duration : null;
      if (durationSec === null) continue;
      const parsed = item.geometry ? wktToGeoJson(item.geometry) : null;
      const itemStatus = (item.status ?? (parsed ? 'OK' : 'build_error')).toUpperCase();
      if (!parsed || itemStatus !== 'OK') {
        failed += 1;
        zones.push({
          durationSec,
          wkt: item.geometry ?? null,
          geometry: parsed?.geometry ?? null,
          startPoint: item.start_point ? [item.start_point.lon, item.start_point.lat] : null,
          attractPoints: (item.attract_points ?? []).map((p) => [p.lon, p.lat] as LngLat),
          buildStatus: 'build_error',
        });
        continue;
      }
      zones.push({
        durationSec,
        wkt: item.geometry ?? null,
        geometry: parsed.geometry,
        startPoint: item.start_point ? [item.start_point.lon, item.start_point.lat] : null,
        attractPoints: (item.attract_points ?? []).map((p) => [p.lon, p.lat] as LngLat),
        buildStatus: 'OK',
      });
    }

    const status: IsochroneProviderResult['status'] =
      rawStatus === 'OK'
        ? 'ok'
        : rawStatus === 'PARTIAL_SUCCESS'
          ? 'partial_success'
          : rawStatus === 'BUILD_ERROR'
            ? 'build_error'
            : zones.length > 0
              ? 'partial_success'
              : 'error';

    return {
      status,
      zones,
      transport: 'walking',
      generationTimeSec: typeof payload.generation_time === 'number' ? payload.generation_time : null,
      apiVersion: ISOCHRONE_API_VERSION,
      isMock: false,
      note:
        failed > 0
          ? `Isochrone API: ${failed} из ${items.length} зон не построены (build_error)`
          : null,
    };
  }
}

function emptyResult(note: string, status: IsochroneProviderResult['status'] = 'error'): IsochroneProviderResult {
  return {
    status,
    zones: [],
    transport: 'walking',
    generationTimeSec: null,
    apiVersion: ISOCHRONE_API_VERSION,
    isMock: false,
    note,
  };
}

async function backoff(attempt: number): Promise<void> {
  const delayMs = 500 * 2 ** attempt; // 0.5s → 1s → 2s (§4.5)
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Фабрика провайдера по переменным окружения (§10). */
export function createIsochroneProvider(env: {
  ISOCHRONE_PROVIDER?: string;
  ROUTING_API_KEY?: string;
  ISOCHRONE_MOCK_GEOMETRY?: string;
}): IsochroneProvider {
  if (env.ISOCHRONE_PROVIDER === 'live') {
    if (!env.ROUTING_API_KEY) {
      throw new Error('ISOCHRONE_PROVIDER=live требует ROUTING_API_KEY (см. .env.example)');
    }
    return new DvaGisIsochroneProvider({ apiKey: env.ROUTING_API_KEY });
  }
  return new MockIsochroneProvider({
    syntheticGeometry: (env.ISOCHRONE_MOCK_GEOMETRY ?? 'true').toLowerCase() !== 'false',
  });
}
