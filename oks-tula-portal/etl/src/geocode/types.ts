/**
 * Типы и контракт геокодирования (§6.3, §10 ТЗ).
 * Провайдер выбирается переменной окружения GEOCODER_PROVIDER=mock|live.
 * Ключ Catalog API — секретный, только на бэкенде/в ETL-джобе, никогда в логах.
 */

export type GeocodeStatus =
  | 'ok'
  | 'not_found'
  | 'provider_mock' // мок-провайдер: результатов нет, задача ждёт боевого ключа
  | 'provider_disabled' // ключ не задан
  | 'error';

/** Элемент цепочки административного деления (items.adm_div). */
export interface AdmDiv {
  id?: number;
  name: string;
  type?: string; // district / city / settlement / region ...
}

/** Кандидат геокодера (структурно соответствует items[] Catalog API 2ГИС). */
export interface GeocodeCandidate {
  id: string;
  fullName: string;
  point: { lat: number; lon: number };
  addressName: string | null;
  admDiv: AdmDiv[];
  /** Извлечённые компоненты адреса кандидата (для скоринга). */
  components?: {
    settlement?: string | null;
    street?: string | null;
    house?: string | null;
  };
}

export interface GeocodeResponse {
  status: GeocodeStatus;
  candidates: GeocodeCandidate[];
  note?: string;
}

export interface ReverseGeocodeResponse {
  status: GeocodeStatus;
  admDiv: AdmDiv[];
  addressName: string | null;
  note?: string;
}

/** Ожидаемая административная привязка объекта (для валидации кандидата). */
export interface ExpectedLocation {
  /** id МО из справочника + его официальные/короткие наименования. */
  municipalityId: string | null;
  municipalityNames: string[];
  settlement: string | null;
  street: string | null;
  house: string | null;
}

export interface GeocoderProvider {
  readonly kind: 'mock' | 'live';
  geocode(query: string): Promise<GeocodeResponse>;
  /** Обратное геокодирование (q=lat,lon) — верификация координат из CSV (§6.3 п.4). */
  reverse(lat: number, lon: number): Promise<ReverseGeocodeResponse>;
}
