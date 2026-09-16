/**
 * Провайдеры геокодирования (§10 ТЗ: «мок сейчас — боевое подключение позже»).
 *
 * MockGeocoder — структурно идентичный ответ без результатов: объекты остаются
 * в очереди геокодирования до появления CATALOG_API_KEY (демо-режим честен:
 * координаты не выдумываются).
 *
 * DvaGisGeocoder — боевой клиент Catalog API 2ГИС (§4.3):
 *   GET https://catalog.api.2gis.com/3.0/items/geocode?q=<адрес>&key=<KEY>
 *       &region_id=36&fields=items.point,items.address,items.adm_div&page_size=10
 * Ретраи с экспоненциальной задержкой (макс. 3), обработка status != "ok".
 * Ключ — только из переменной окружения, никогда не логируется (§15.11).
 */

import { REGION_ID } from '@oks/shared';
import type {
  AdmDiv,
  GeocodeCandidate,
  GeocodeResponse,
  GeocoderProvider,
  ReverseGeocodeResponse,
} from './types';

const GEOCODE_URL = 'https://catalog.api.2gis.com/3.0/items/geocode';
const MAX_RETRIES = 3;

/** Мок-провайдер: никогда не выдумывает координаты. */
export class MockGeocoder implements GeocoderProvider {
  readonly kind = 'mock' as const;

  async geocode(): Promise<GeocodeResponse> {
    return {
      status: 'provider_mock',
      candidates: [],
      note: 'Геокодинг в демо-режиме не выполняется: координаты не выдумываются. Задайте CATALOG_API_KEY и GEOCODER_PROVIDER=live для боевого прогона.',
    };
  }

  async reverse(): Promise<ReverseGeocodeResponse> {
    return {
      status: 'provider_mock',
      admDiv: [],
      addressName: null,
      note: 'Верификация координат обратным геокодированием доступна только с CATALOG_API_KEY.',
    };
  }
}

interface DvaGisItem {
  id?: string;
  full_name?: string;
  name?: string;
  point?: { lat: number; lon: number };
  address?: { name?: string; components?: unknown };
  adm_div?: { id?: number; name?: string; type?: string }[];
  purpose_name?: string;
}

interface DvaGisResponse {
  items?: DvaGisItem[];
  item_count?: number;
  meta?: unknown;
}

export interface DvaGisGeocoderOptions {
  apiKey: string;
  regionId?: number;
  pageSize?: number;
  timeoutMs?: number;
}

/** Боевой клиент Catalog API 2ГИС. */
export class DvaGisGeocoder implements GeocoderProvider {
  readonly kind = 'live' as const;
  private readonly apiKey: string;
  private readonly regionId: number;
  private readonly pageSize: number;
  private readonly timeoutMs: number;

  constructor(opts: DvaGisGeocoderOptions) {
    this.apiKey = opts.apiKey;
    this.regionId = opts.regionId ?? REGION_ID;
    this.pageSize = Math.min(opts.pageSize ?? 10, 10); // page_size до 10 (§4.6)
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async geocode(query: string): Promise<GeocodeResponse> {
    return this.request({ q: query });
  }

  /** Обратное геокодирование: q=lat,lon (§6.3 п.4). */
  async reverse(lat: number, lon: number): Promise<ReverseGeocodeResponse> {
    const res = await this.request({ q: `${lat},${lon}` });
    if (res.status !== 'ok') {
      return { status: res.status, admDiv: [], addressName: null, note: res.note };
    }
    const first = res.candidates[0];
    return {
      status: 'ok',
      admDiv: first?.admDiv ?? [],
      addressName: first?.addressName ?? null,
    };
  }

  private async request(params: Record<string, string>): Promise<GeocodeResponse> {
    const search = new URLSearchParams({
      ...params,
      key: this.apiKey,
      region_id: String(this.regionId),
      fields: 'items.point,items.address,items.adm_div',
      page_size: String(this.pageSize),
    });
    let lastError: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(`${GEOCODE_URL}?${search.toString()}`, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          await backoff(attempt);
          continue;
        }
        if (!response.ok) {
          // ключ в ошибку не включаем (§15.11)
          return { status: 'error', candidates: [], note: `HTTP ${response.status}` };
        }
        const body = (await response.json()) as DvaGisResponse;
        const items = body.items ?? [];
        if (items.length === 0) {
          return { status: 'not_found', candidates: [] };
        }
        return { status: 'ok', candidates: items.map(mapItem) };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await backoff(attempt);
      }
    }
    return { status: 'error', candidates: [], note: `исчерпаны ретраи: ${lastError ?? 'неизвестно'}` };
  }
}

async function backoff(attempt: number): Promise<void> {
  const delayMs = 500 * 2 ** attempt; // 0.5s, 1s, 2s
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function mapItem(item: DvaGisItem): GeocodeCandidate {
  const admDiv: AdmDiv[] = (item.adm_div ?? []).map((d) => ({
    id: d.id,
    name: d.name ?? '',
    type: d.type,
  }));
  const addressName = item.address?.name ?? null;
  return {
    id: item.id ?? '',
    fullName: item.full_name ?? item.name ?? '',
    point: item.point ? { lat: item.point.lat, lon: item.point.lon } : { lat: 0, lon: 0 },
    addressName,
    admDiv,
    components: extractComponents(addressName),
  };
}

/**
 * Минимальное извлечение компонентов из строки адреса кандидата
 * («Тула, Большая улица, 8» → settlement/street/house).
 */
export function extractComponents(addressName: string | null): GeocodeCandidate['components'] {
  if (!addressName) return { settlement: null, street: null, house: null };
  const parts = addressName.split(',').map((p) => p.trim());
  const settlement = parts[0] ?? null;
  let street: string | null = null;
  let house: string | null = null;
  for (const part of parts.slice(1)) {
    const houseMatch = /^(?:д\.?|дом)\s*(.+)$/i.exec(part) ?? /^(\d+[А-Яа-я]?(?:\/\d+[А-Яа-я]?)?)$/.exec(part);
    if (houseMatch && house === null) {
      house = houseMatch[1] ?? null;
      continue;
    }
    if (street === null) street = part;
  }
  return { settlement, street, house };
}

/** Фабрика провайдера по переменной окружения. */
export function createGeocoderProvider(env: {
  GEOCODER_PROVIDER?: string;
  CATALOG_API_KEY?: string;
}): GeocoderProvider {
  if (env.GEOCODER_PROVIDER === 'live') {
    if (!env.CATALOG_API_KEY) {
      throw new Error('GEOCODER_PROVIDER=live требует CATALOG_API_KEY (см. .env.example)');
    }
    return new DvaGisGeocoder({ apiKey: env.CATALOG_API_KEY });
  }
  return new MockGeocoder();
}
