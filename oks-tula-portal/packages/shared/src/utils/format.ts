/**
 * Утилиты форматирования для русской локали (§8 ТЗ):
 * даты — ДД.ММ.ГГГГ, числа — с неразрывным пробелом-разделителем тысяч,
 * корректные склонения («1 объект», «5 объектов»).
 */

/** Неразрывный пробел — разделитель тысяч по ГОСТ. */
export const NBSP = '\u00A0';

/** Дата ISO (YYYY-MM-DD) → ДД.ММ.ГГГГ. Для пустых значений — null («Нет данных» в UI). */
export function formatDateRu(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Дата+время ISO → ДД.ММ.ГГГГ ЧЧ:ММ. */
export function formatDateTimeRu(isoDateTime: string | null | undefined): string | null {
  if (!isoDateTime) return null;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return null;
  const date = formatDateRu(d.toISOString().slice(0, 10));
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

/** Число → строка с неразрывным пробелом-разделителем тысяч и запятой-десятичной. */
export function formatNumberRu(value: number | null | undefined, digits = 0): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const fixed = value.toFixed(digits);
  const [intPart, fracPart] = fixed.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const unsigned = sign ? intPart.slice(1) : intPart;
  const grouped = unsigned.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return sign + grouped + (fracPart ? `,${fracPart}` : '');
}

/** Площадь в м² → «12 791 м²» (с округлением до 2 знаков, лишние нули убираются). */
export function formatAreaM2(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const digits = Number.isInteger(value) ? 0 : 2;
  return `${formatNumberRu(value, digits)}${NBSP}м²`;
}

/** Процент 0–100 → «88,5 %». */
export function formatPercent(value: number | null | undefined, digits = 1): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `${formatNumberRu(value, digits)}${NBSP}%`;
}

/**
 * Склонение существительных: pluralRu(5, ['объект','объекта','объектов']) → «5 объектов».
 * Число форматируется с разделителем тысяч.
 */
export function pluralRu(value: number, forms: [string, string, string]): string {
  const n = Math.abs(Math.trunc(value));
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = forms[0];
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = forms[1];
  else form = forms[2];
  return `${formatNumberRu(value)}${NBSP}${form}`;
}

/** Диапазон дат → «15.09.2022 – 28.10.2022» (или одно значение / «Нет данных» на уровне UI). */
export function formatDateRangeRu(start: string | null, end: string | null): string | null {
  const s = formatDateRu(start);
  const e = formatDateRu(end);
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s ?? e ?? null;
}

/** Сегодняшняя дата в ISO (YYYY-MM-DD), локальная часовая зона. */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
