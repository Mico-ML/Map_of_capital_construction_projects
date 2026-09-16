/**
 * Нормализация записей реестра (§6.1 ТЗ).
 * Чистые функции без побочных эффектов — покрыты unit-тестами (etl/tests).
 * Ничего не выдумываем: неопознанное → null + флаг в отчёт качества.
 */

import type {
  CapacityPart,
  ContractorContractRef,
  DateRange,
  ExpertiseRecord,
  GeocodeConfidence,
  MunicipalitySource,
  Ownership,
  StatusGroupCode,
} from '@oks/shared';
import {
  CAPACITY_UNITS,
  INDUSTRY_RAW_TO_CODE,
  MUNICIPALITIES,
  MUNICIPALITY_CSV_ALIASES,
  STATUS_RAW_TO_CODE,
} from '@oks/shared';
import { COL, type ObjectsTable, buildRawRecord } from './csv_parser';
import {
  GRBS_INDUSTRY_AMBIGUOUS,
  GRBS_TO_INDUSTRY,
  ORGANIZATION_ALIASES,
  PROGRAM_FP_ALIASES,
  PROGRAM_NP_ALIASES,
  SETTLEMENT_TO_MUNICIPALITY,
  orgAliasKey,
} from './config/aliases';

// ---------------------------------------------------------------------------
// Базовая очистка строк
// ---------------------------------------------------------------------------

/** Универсальные «пустые» токены источника (§6.1 п.2). */
const EMPTY_TOKENS = new Set(['', '-', '—', '–', 'нет', 'не требуется']);

/** Очистка строки: NBSP/тонкие пробелы → обычные, переводы строк/табы → пробел, схлопывание пробелов. */
export function cleanWhitespace(value: string): string {
  return value
    .replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Пустое ли значение (для текстовых полей; `0` здесь НЕ пустота — см. §6.1 п.2). */
export function isBlank(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const v = cleanWhitespace(value).toLowerCase();
  return EMPTY_TOKENS.has(v);
}

/** Пустое значение с учётом того, что `0`/`0,00` в смысловых полях — тоже «нет данных». */
export function nullIfEmpty(value: string | null | undefined, opts?: { zeroIsEmpty?: boolean }): string | null {
  if (isBlank(value)) return null;
  const v = cleanWhitespace(value as string);
  if (opts?.zeroIsEmpty && /^0([.,]0+)?$/.test(v)) return null;
  return v;
}

// ---------------------------------------------------------------------------
// Числа и даты (§6.1 п.3–4)
// ---------------------------------------------------------------------------

/** «5 556,00» / «13572,8» / «12 791» → number. Неразрывные пробелы-разделители учитываются. */
export function parseRuNumber(value: string | null | undefined): number | null {
  if (isBlank(value)) return null;
  const normalized = cleanWhitespace(value as string)
    .replace(/[\u00A0\u2007\u2009\u202F ]/g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** ДД.ММ.ГГГГ → ISO YYYY-MM-DD. Строгая проверка календарной корректности. */
export function parseRuDate(value: string | null | undefined): string | null {
  if (isBlank(value)) return null;
  const v = cleanWhitespace(value as string);
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() + 1 !== Number(mm) ||
    d.getUTCDate() !== Number(dd)
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Двухзначный год → век: <50 → 20xx, иначе 19xx (для «21.11.25-01.06.27»). */
function expandTwoDigitYear(yy: string): string {
  const n = Number(yy);
  return String(n < 50 ? 2000 + n : 1900 + n);
}

/** Год из значения, которое может быть годом или полной датой («01.01.2026» → 2026). */
export function parseYearOrDate(value: string | null | undefined): { year: number | null; note?: string } {
  if (isBlank(value)) return { year: null };
  const v = cleanWhitespace(value as string);
  if (/^\d{4}$/.test(v)) return { year: Number(v) };
  const asDate = parseRuDate(v);
  if (asDate) return { year: Number(asDate.slice(0, 4)), note: 'год извлечён из полной даты' };
  return { year: null, note: `нераспознанное значение: ${v}` };
}

/**
 * Диапазон дат «Сроки контракта»/«Сроки строительства». Фактические форматы источника:
 *  - «15.09.2022-28.10.2022», «01.08.2023 - 25.11.2024», «29.12.2021 – 31.03.2023» (en-dash);
 *  - «с 27.01.2026 по 01.09.2027»;
 *  - «10-03-2025-30.03.2026» (опечатка: дефисы в первой дате);
 *  - «26.12.2023-10.12-2024» (опечатка: «10.12-2024»);
 *  - «21.11.25-01.06.27» (двухзначные годы);
 *  - «2025-2030» (только годы), «15.12.2025» (одна дата).
 */
export function parseDateRange(value: string | null | undefined): DateRange | null {
  if (isBlank(value)) return null;
  const raw = cleanWhitespace(value as string);

  // «с X по Y»
  const withWords = /^с\s*(.+?)\s+по\s+(.+)$/i.exec(raw);
  if (withWords) {
    const start = parseRuDate(withWords[1]);
    const end = parseRuDate(withWords[2]);
    if (start || end) {
      return { start, end, raw, note: start && end ? undefined : 'часть диапазона не распознана' };
    }
  }

  // унификация тире
  const unified = raw.replace(/[–—−]/g, '-');

  // две полные даты
  const twoFull = /^(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})$/.exec(unified);
  if (twoFull) {
    return { start: parseRuDate(twoFull[1]), end: parseRuDate(twoFull[2]), raw };
  }
  // опечатка: ДД-ММ-ГГГГ-ДД.ММ.ГГГГ («10-03-2025-30.03.2026»)
  const typoFirst = /^(\d{2})-(\d{2})-(\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})$/.exec(unified);
  if (typoFirst) {
    const start = parseRuDate(`${typoFirst[1]}.${typoFirst[2]}.${typoFirst[3]}`);
    return {
      start,
      end: parseRuDate(typoFirst[4]),
      raw,
      note: 'исправлена опечатка формата первой даты (ДД-ММ-ГГГГ)',
    };
  }
  // опечатка: ДД.ММ.ГГГГ-ДД.ММ-ГГГГ («26.12.2023-10.12-2024»)
  const typoSecond = /^(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2})-(\d{4})$/.exec(unified);
  if (typoSecond) {
    return {
      start: parseRuDate(typoSecond[1]),
      end: parseRuDate(`${typoSecond[2]}.${typoSecond[3]}`),
      raw,
      note: 'исправлена опечатка формата второй даты (ДД.ММ-ГГГГ)',
    };
  }
  // двухзначные годы («21.11.25-01.06.27»)
  const shortYears = /^(\d{2})\.(\d{2})\.(\d{2})\s*-\s*(\d{2})\.(\d{2})\.(\d{2})$/.exec(unified);
  if (shortYears) {
    const start = parseRuDate(`${shortYears[1]}.${shortYears[2]}.${expandTwoDigitYear(shortYears[3])}`);
    const end = parseRuDate(`${shortYears[4]}.${shortYears[5]}.${expandTwoDigitYear(shortYears[6])}`);
    return { start, end, raw, note: 'двухзначные годы раскрыты по правилу: <50 → 20xx' };
  }
  // только годы («2025-2030»)
  const yearsOnly = /^(\d{4})\s*-\s*(\d{4})$/.exec(unified);
  if (yearsOnly) {
    return { start: null, end: null, raw, note: 'указаны только годы без точных дат' };
  }
  // одна полная дата
  const single = parseRuDate(unified);
  if (single) {
    return {
      start: null,
      end: single,
      raw,
      note: 'одна дата вместо диапазона — интерпретирована как дата окончания; требует подтверждения',
    };
  }
  return { start: null, end: null, raw, note: 'формат не распознан' };
}

// ---------------------------------------------------------------------------
// Кавычки и организации (§6.1 п.5)
// ---------------------------------------------------------------------------

/** Прямые кавычки " → «ёлочки» (переключателем); «» не трогает. */
export function normalizeQuotes(value: string): string {
  let open = true;
  return value.replace(/"/g, () => {
    const q = open ? '«' : '»';
    open = !open;
    return q;
  });
}

// Внимание: JS \b не работает для кириллицы — используем явные границы.
const LEGAL_FORM_PREFIX_RE = /(^|[\s,;()])(ООО|ОАО|ЗАО|АО|МУП|ГУП|ППК|ФКУ|МАУ|ГПОУ|ГУК|ГУЗ|ГУ|МУ)(?=[«А-ЯЁ])/g;

export interface OrgNormalizationResult {
  /** Каноническое наименование (после алиасов) либо очищенное исходное. */
  canonical: string | null;
  /** Очищенное значение до применения алиасов. */
  cleaned: string | null;
  /** Контрактные реквизиты, «зашитые» в ячейку (№ … от …). */
  contractRefs: ContractorContractRef[];
  /** true — значение склеено из нескольких организаций/вариантов. */
  mergedViaAlias: boolean;
  note?: string;
}

/** Хвостовые/ведущие контрактные реквизиты в ячейке «Подрядчик». */
const CONTRACT_REF_TAIL_RE = /\s*[,;]?\s*№+\s*([0-9A-Za-zА-Яа-я./-]+)(?:\s+от\s+(\d{2}\.\d{2}\.\d{4}))?\s*$/u;
const CONTRACT_REF_LEAD_RE = /^\s*№+\s*([0-9A-Za-zА-Яа-я./-]+)\s+от\s+(\d{2}\.\d{2}\.\d{4})\s+/u;

/**
 * Нормализация наименования организации: пробелы → кавычки-ёлочки → пробел после
 * оргформы → вырезание контрактных реквизитов → ролевые суффиксы → алиасы.
 */
export function normalizeOrgName(value: string | null | undefined): OrgNormalizationResult {
  const empty: OrgNormalizationResult = { canonical: null, cleaned: null, contractRefs: [], mergedViaAlias: false };
  const base = nullIfEmpty(value, { zeroIsEmpty: true });
  if (!base) return empty;

  let s = normalizeQuotes(base);
  s = s.replace(LEGAL_FORM_PREFIX_RE, '$1$2 ');
  // ролевой суффикс («ООО "МВ-Проект" (ПИР)»)
  const roleSuffix = /\s*\((ПИР|СМР)\)\s*$/.exec(s);
  let note: string | undefined;
  if (roleSuffix) {
    s = s.slice(0, roleSuffix.index).trim();
    note = `в источнике указан этап работ: ${roleSuffix[1]}`;
  }

  // контрактные реквизиты внутри ячейки
  const contractRefs: ContractorContractRef[] = [];
  let m = CONTRACT_REF_TAIL_RE.exec(s);
  if (m) {
    contractRefs.push({ number: m[1] ?? null, date: m[2] ? parseRuDate(m[2]) : null, raw: m[0].trim() });
    s = s.slice(0, m.index).trim();
  }
  m = CONTRACT_REF_LEAD_RE.exec(s);
  if (m) {
    contractRefs.push({ number: m[1] ?? null, date: parseRuDate(m[2] ?? null), raw: m[0].trim() });
    s = s.slice(m[0].length).trim();
  }

  // составной заказчик: «ГУКС "ТулоблУКС", АМО г. Донской» → основная организация
  // (кириллическое «АМО» — без \b, в JS оно не работает для кириллицы)
  const composite = s.split(/,\s*(?=АМО\s)/);
  if (composite.length > 1) {
    note = [note, `составная запись; вторая часть сохранена в raw: ${composite.slice(1).join(', ')}`]
      .filter(Boolean)
      .join('; ');
    s = (composite[0] ?? '').trim();
  }
  s = s.replace(/^[,;]\s*|\s*[,;]$/g, '').trim();

  const cleaned = s || null;
  if (!cleaned) return { ...empty, contractRefs, note };

  const key = orgAliasKey(cleaned);
  const alias = ORGANIZATION_ALIASES[key];
  const canonical = alias?.canonical ?? cleaned;
  const mergedViaAlias = Boolean(alias) && alias.canonical !== cleaned;
  const aliasNote = alias?.note;
  return {
    canonical,
    cleaned,
    contractRefs,
    mergedViaAlias,
    note: [note, aliasNote].filter(Boolean).join('; ') || undefined,
  };
}

// ---------------------------------------------------------------------------
// Программы (НП/ГП, ФП)
// ---------------------------------------------------------------------------

const PROGRAM_SUBPROGRAM_RE = /\s*РП\s*:?\s*.*$/i;
const PROGRAM_PREFIX_RES: RegExp[] = [
  /^ГП\s*:\s*/i,
  /^ГП\s+ТО\s+/i,
  /^ГП\s+РФ\s+/i,
  /^ГП\s+/i,
  /^НП\s+/i,
  /^ФП\s+/i,
  /^[Гг]осударственная программа (?:Российской Федерации|Тульской области)\s*/i,
];

export interface ProgramNormalizationResult {
  canonical: string | null;
  cleaned: string | null;
  mergedViaAlias: boolean;
  note?: string;
}

/** Нормализация наименования программы: подпрограмма (РП) отсекается, префиксы снимаются. */
export function normalizeProgramName(
  value: string | null | undefined,
  table: Record<string, string>,
): ProgramNormalizationResult {
  const base = nullIfEmpty(value, { zeroIsEmpty: false });
  if (!base) return { canonical: null, cleaned: null, mergedViaAlias: false };

  let s = base;
  const subprogram = PROGRAM_SUBPROGRAM_RE.exec(s);
  if (subprogram) s = s.slice(0, subprogram.index);
  for (const re of PROGRAM_PREFIX_RES) {
    s = s.replace(re, '');
  }
  s = normalizeQuotes(s);
  s = s.replace(/»[а-яё]{1,2}$/i, '»'); // опечатка «...области»и»
  const cleaned = s.replace(/^[,;]\s*|\s*[,;]$/g, '').replace(/^«|»$/g, '').trim() || null;
  if (!cleaned) return { canonical: null, cleaned: null, mergedViaAlias: false };

  const key = orgAliasKey(cleaned);
  const canonical = table[key] ?? null;
  const note = subprogram
    ? `подпрограмма (РП) сохранена в raw: ${subprogram[0].trim()}`
    : undefined;
  return { canonical, cleaned, mergedViaAlias: canonical !== null && canonical !== cleaned, note };
}

// ---------------------------------------------------------------------------
// Отрасль, статус, собственность, МО
// ---------------------------------------------------------------------------

export interface IndustryNormalization {
  industryCode: string | null;
  /** csv — значение из реестра; inferred — восстановлено по ГРБС. */
  industrySource: 'csv' | 'inferred' | null;
  /** true — требуется ручная модерация (ГРБС неоднозначен). */
  needsModeration: boolean;
  note?: string;
}

/** Нормализация отрасли + восстановление по ГРБС (§6.1 п.7). */
export function normalizeIndustry(rawIndustry: string, rawGrbs: string | null): IndustryNormalization {
  const industry = nullIfEmpty(rawIndustry, { zeroIsEmpty: true });
  if (industry) {
    const code = INDUSTRY_RAW_TO_CODE[industry] ?? null;
    if (code) {
      const note = code === 'housing_utilities' && industry !== 'Жилищно-коммунальное хозяйство'
        ? 'вариант написания без дефиса объединён со справочным значением'
        : undefined;
      return { industryCode: code, industrySource: 'csv', needsModeration: false, note };
    }
    return {
      industryCode: null,
      industrySource: null,
      needsModeration: true,
      note: `нераспознанное значение отрасли: ${industry}`,
    };
  }
  const grbs = rawGrbs ? normalizeOrgName(rawGrbs).canonical : null;
  if (grbs) {
    if (GRBS_INDUSTRY_AMBIGUOUS.includes(grbs)) {
      return {
        industryCode: null,
        industrySource: null,
        needsModeration: true,
        note: `отрасль не указана (0); ГРБС «${grbs}» неоднозначен — требуется модерация`,
      };
    }
    const inferred = GRBS_TO_INDUSTRY[grbs];
    if (inferred) {
      return {
        industryCode: inferred,
        industrySource: 'inferred',
        needsModeration: false,
        note: `отрасль восстановлена по ГРБС «${grbs}»`,
      };
    }
  }
  return {
    industryCode: null,
    industrySource: null,
    needsModeration: true,
    note: 'отрасль не указана (0), ГРБС отсутствует в маппинге — требуется модерация',
  };
}

export interface StatusNormalization {
  statusCode: string | null;
  statusGroup: StatusGroupCode | null;
  note?: string;
}

/** Нормализация статуса (6 точных значений реестра → код + группа). */
export function normalizeStatus(raw: string): StatusNormalization {
  const value = nullIfEmpty(raw, { zeroIsEmpty: false });
  if (!value) return { statusCode: null, statusGroup: null, note: 'статус не указан' };
  const code = STATUS_RAW_TO_CODE[value] ?? null;
  if (!code) {
    return { statusCode: null, statusGroup: null, note: `нераспознанный статус: ${value}` };
  }
  const group = (
    {
      commissioned: 'completed',
      smr: 'construction',
      pir: 'design',
      pir_smr: 'construction',
      ea_preparation: 'procurement',
      budget_investments: 'procurement',
    } as Record<string, StatusGroupCode>
  )[code];
  return { statusCode: code, statusGroup: group };
}

/** Собственность: «0»/пусто → unknown (§5 ТЗ). */
export function normalizeOwnership(raw: string): Ownership {
  const value = nullIfEmpty(raw, { zeroIsEmpty: true });
  if (!value) return 'unknown';
  if (/^муниципальн/i.test(value)) return 'municipal';
  if (/^государственн/i.test(value)) return 'state';
  return 'unknown';
}

export interface MunicipalityNormalization {
  municipalityId: string | null;
  municipalitySource: MunicipalitySource | null;
  confidence: GeocodeConfidence | null;
  matchedToken?: string;
  note?: string;
}

/** Нормализация колонки «АМО» (24 варианта написания → 20 МО). */
export function normalizeMunicipalityColumn(raw: string): MunicipalityNormalization {
  const value = nullIfEmpty(raw, { zeroIsEmpty: true });
  if (!value) {
    return { municipalityId: null, municipalitySource: null, confidence: null };
  }
  const byAlias = MUNICIPALITY_CSV_ALIASES[value];
  if (byAlias) {
    return { municipalityId: byAlias, municipalitySource: 'csv_column', confidence: 'high' };
  }
  // резерв: поиск эталонного названия МО внутри строки
  const lower = value.toLowerCase().replace(/ё/g, 'е');
  for (const m of MUNICIPALITIES) {
    const shortStem = m.nameShort
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/^(г\.|амо)\s*/, '')
      .replace(/\s*район$/, '');
    if (shortStem && lower.includes(shortStem)) {
      return {
        municipalityId: m.id,
        municipalitySource: 'csv_column',
        confidence: 'medium',
        matchedToken: shortStem,
        note: 'определено по вхождению названия МО (не по точному алиасу)',
      };
    }
  }
  return {
    municipalityId: null,
    municipalitySource: null,
    confidence: null,
    note: `нераспознанное значение АМО: ${value}`,
  };
}

/**
 * Извлечение населённого пункта из произвольного текста (адрес или наименование)
 * — для восстановления МО (§6.3 п.5). Совпадение — по самому длинному токену.
 */
export function inferMunicipalityFromText(text: string | null): MunicipalityNormalization {
  if (!text) return { municipalityId: null, municipalitySource: null, confidence: null };
  const lower = cleanWhitespace(text).toLowerCase().replace(/ё/g, 'е');
  let best: { id: string; token: string } | null = null;
  for (const [token, id] of Object.entries(SETTLEMENT_TO_MUNICIPALITY)) {
    const normalizedToken = token.replace(/ё/g, 'е');
    const re = new RegExp(`(^|[^а-яa-z0-9])${normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^а-яa-z0-9]|$)`, 'i');
    if (re.test(lower) && (!best || normalizedToken.length > best.token.length)) {
      best = { id, token: normalizedToken };
    }
  }
  if (!best) return { municipalityId: null, municipalitySource: null, confidence: null };
  return {
    municipalityId: best.id,
    municipalitySource: null, // проставляется вызывающим кодом (address/name)
    confidence: 'low',
    matchedToken: best.token,
  };
}

// ---------------------------------------------------------------------------
// Площадь, мощность, экспертиза, готовность
// ---------------------------------------------------------------------------

export interface AreaNormalization {
  areaM2: number | null;
  zeroInSource: boolean;
  note?: string;
}

/** ОБЩАЯ пл., м²: 0/0,00 → null (35 записей в источнике, §5 ТЗ). */
export function normalizeArea(raw: string): AreaNormalization {
  const value = parseRuNumber(raw);
  if (value === null) {
    const zero = /^0([.,]0+)?$/.test(cleanWhitespace(raw));
    return { areaM2: null, zeroInSource: zero, note: zero ? 'в источнике 0 — площадь не заполнена' : undefined };
  }
  if (value === 0) return { areaM2: null, zeroInSource: true, note: 'в источнике 0 — площадь не заполнена' };
  if (value < 0) return { areaM2: null, zeroInSource: false, note: `отрицательная площадь в источнике: ${raw}` };
  return { areaM2: value, zeroInSource: false };
}

export interface CapacityNormalization {
  /** Основное значение (первая часть составной мощности). */
  value: number | null;
  unitCode: string | null;
  parts: CapacityPart[];
  raw: string | null;
  note?: string;
}

const UNIT_BY_ALIAS = new Map<string, string>(
  CAPACITY_UNITS.flatMap((u) => u.aliases.map((a) => [a.toLowerCase(), u.code])),
);

/**
 * Мощность (§5 ТЗ): 62 уникальных значения, смешанные единицы.
 * «Голое» число — в единицах «мест» (заголовок колонки: «кол-во мест»).
 * Диапазоны («2500-3000м3/сут») значением не заполняются — только raw + помета.
 */
export function normalizeCapacity(raw: string): CapacityNormalization {
  const value0 = nullIfEmpty(raw, { zeroIsEmpty: true });
  if (!value0) {
    const zero = /^0([.,]0+)?$/.test(cleanWhitespace(raw));
    return {
      value: null,
      unitCode: null,
      parts: [],
      raw: raw.trim() || null,
      note: zero ? 'в источнике 0 — мощность не заполнена' : undefined,
    };
  }
  const notes: string[] = [];
  // диапазон «2500-3000м3/сут»
  const range = /^(\d+)\s*-\s*(\d+)\s*(.*)$/.exec(value0);
  if (range) {
    const unitRaw = cleanWhitespace(range[3] ?? '');
    notes.push(`диапазон ${range[1]}–${range[2]}: значение не заполнено, только raw`);
    return {
      value: null,
      unitCode: matchUnit(unitRaw) ?? null,
      parts: [{ value: null, unitCode: matchUnit(unitRaw) ?? null, unitRaw }],
      raw: value0,
      note: notes.join('; '),
    };
  }
  // составная мощность «400 посещений, 340 коек» — разделитель «,» с пробелом,
  // чтобы не рвать десятичные дроби («1,8 мВТ»)
  const chunks = value0.split(/,\s+/).map((c) => c.trim()).filter(Boolean);
  const parts: CapacityPart[] = [];
  for (const chunk of chunks) {
    const m = /^([\d\u00A0\s.,]+)\s*(.*)$/.exec(chunk);
    if (!m) {
      notes.push(`нераспознанный фрагмент: ${chunk}`);
      continue;
    }
    const num = parseRuNumber(m[1]);
    const unitRaw = cleanWhitespace(m[2] ?? '');
    const unitCode = matchUnit(unitRaw) ?? (unitRaw ? null : 'places');
    if (unitRaw && unitCode === null) notes.push(`нераспознанная единица: «${unitRaw}»`);
    parts.push({ value: num, unitCode, unitRaw });
  }
  const first = parts[0];
  return {
    value: first?.value ?? null,
    unitCode: first?.unitCode ?? null,
    parts,
    raw: value0,
    note: notes.length ? notes.join('; ') : undefined,
  };
}

function matchUnit(unitRaw: string): string | null {
  if (!unitRaw) return null;
  const normalized = unitRaw.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (UNIT_BY_ALIAS.has(normalized)) return UNIT_BY_ALIAS.get(normalized) ?? null;
  // «м3 / ч» → «м3/ч»
  const compact = normalized.replace(/\s*\/\s*/g, '/');
  if (UNIT_BY_ALIAS.has(compact)) return UNIT_BY_ALIAS.get(compact) ?? null;
  return null;
}

/**
 * ЭКСПЕРТИЗА(Ы): «от ДД.ММ.ГГГГ № 71-1-1-3-038991-2019», несколько через запятую,
 * опечатки «№ №», «0919*23-2022», свободный текст вместо номера (стр. 41).
 */
export function parseExpertise(raw: string): { records: ExpertiseRecord[]; notes: string[] } {
  const value = nullIfEmpty(raw, { zeroIsEmpty: false });
  if (!value) return { records: [], notes: [] };
  const notes: string[] = [];
  const chunks = value.split(/,(?=\s*от\s)/i);
  const records: ExpertiseRecord[] = [];
  for (const chunk of chunks) {
    const item = chunk.trim();
    if (!item) continue;
    const m = /^от\s+(\d{2}\.\d{2}\.\d{4})\s*№*\s*(.*)$/is.exec(item);
    if (!m) {
      records.push({ date: null, number: null, raw: item, note: 'нестандартная запись (без «от ДД.ММ.ГГГГ»)' });
      notes.push(`нераспознанный формат экспертизы: ${item.slice(0, 60)}…`);
      continue;
    }
    const date = parseRuDate(m[1]);
    const rest = cleanWhitespace(m[2] ?? '').replace(/^№+\s*/, '');
    let note: string | undefined;
    if (/№/.test(m[2] ?? '')) note = 'опечатка «№ №» в источнике исправлена';
    const numMatch = /^([0-9A-Za-zА-Яа-я.*\-/]+)$/.exec(rest);
    let number: string | null = null;
    if (numMatch) {
      number = numMatch[1] ?? null;
      if (number.includes('*')) note = [note, 'в номере символ «*» вместо дефиса (как в источнике)'].filter(Boolean).join('; ');
    } else if (rest) {
      note = [note, 'вместо номера — текст; сохранено в raw'].filter(Boolean).join('; ');
      notes.push(`экспертиза без номера (текст): ${rest.slice(0, 80)}…`);
    }
    records.push({ date, number, raw: item, note });
  }
  return { records, notes };
}

/**
 * Строительная готовность: 0 — валидное значение («работы не начаты» при ПИР),
 * «0,00» при активном статусе НЕ трактуется как «нет данных» (§6.1 п.2).
 */
export function normalizeReadiness(raw: string): { value: number | null; note?: string } {
  const cleaned = cleanWhitespace(raw);
  if (cleaned === '' || cleaned === '-') return { value: null };
  const n = parseRuNumber(cleaned);
  if (n === null) return { value: null, note: `нераспознанная готовность: ${raw}` };
  if (n < 0 || n > 100) return { value: Math.min(100, Math.max(0, n)), note: `готовность вне 0–100: ${n}` };
  return { value: n };
}

// ---------------------------------------------------------------------------
// Адрес
// ---------------------------------------------------------------------------

/**
 * Лёгкая нормализация адреса: «г,Тула» → «г. Тула», пробелы после сокращений,
 * «обл,» → «обл.», схлопывание пробелов. Полная стандартизация — через геокодер.
 */
export function normalizeAddressText(raw: string): string | null {
  // «0» в колонке адреса — «нет данных» (§6.1 п.2: текстовые поля)
  const base = nullIfEmpty(raw, { zeroIsEmpty: true });
  if (!base) return null;
  let s = base;
  // JS \b не работает для кириллицы — явные границы через (^|\s)
  // «г,Тула» — запятая вместо точки (опечатка): → «г. Тула»
  s = s.replace(/(^|[\s])г,(?=[А-ЯЁA-Za-z])/g, '$1г. ');
  // «обл,» — запятая-разделитель сохранается, добавляется точка: → «обл.,»
  s = s.replace(/(^|\s)обл,/g, '$1обл.,');
  // пробел после сокращения — только перед БУКВОЙ (названием), не перед номером дома:
  // «ул.Присягина» → «ул. Присягина», но «д.9-а» остаётся как есть
  s = s.replace(/(^|[\s,])(г|п|с|д|ул|пр-т|пр|мкр|рп|пгт|обл|р-н)\.(?=[А-ЯЁA-Za-z])/g, '$1$2. ');
  s = s.replace(/,\s*$/, '');
  s = cleanWhitespace(s);
  return s || null;
}

// ---------------------------------------------------------------------------
// Сборка нормализованного объекта
// ---------------------------------------------------------------------------

/** Нормализованная запись реестра (результат ETL до загрузки в БД). */
export interface NormalizedObject {
  sourceRowNumber: number;
  extId: string | null;
  name: string;
  constructionStage: string | null;
  addressRaw: string | null;
  addressNormalized: string | null;
  lat: number | null;
  lon: number | null;
  industryCode: string | null;
  industrySource: 'csv' | 'inferred' | null;
  industryNeedsModeration: boolean;
  statusCode: string | null;
  statusGroup: StatusGroupCode | null;
  ownership: Ownership;
  municipalityId: string | null;
  municipalitySource: MunicipalitySource | null;
  municipalityConfidence: GeocodeConfidence | null;
  grbsRaw: string | null;
  grbsCanonical: string | null;
  customerRaw: string | null;
  customerCanonical: string | null;
  contractorRaw: string | null;
  contractorCanonical: string | null;
  contractorContractRefs: ContractorContractRef[];
  programNpRaw: string | null;
  programNpCanonical: string | null;
  programFpRaw: string | null;
  programFpCanonical: string | null;
  projectCode: string | null;
  areaM2: number | null;
  capacityValue: number | null;
  capacityUnitCode: string | null;
  capacityParts: CapacityPart[];
  capacityRaw: string | null;
  expertise: ExpertiseRecord[];
  yearStart: number | null;
  yearEnd: number | null;
  constructionPeriod: string | null;
  landTransferDate: string | null;
  permitDate: string | null;
  contractDate: string | null;
  contractPeriod: DateRange | null;
  readinessPct: number | null;
  equipmentDate: string | null;
  hydraulicTestDate: string | null;
  zosDate: string | null;
  zosNumber: string | null;
  actDate: string | null;
  actNumber: string | null;
  commissioningYear: number | null;
  photoDate: string | null;
  raw: Record<string, string>;
  flags: string[];
}

export interface NormalizationResult {
  objects: NormalizedObject[];
  stats: {
    total: number;
    withCoordinates: number;
    withoutCoordinates: number;
    withoutAddress: number;
    municipalityFromColumn: number;
    municipalityInferredFromAddress: number;
    municipalityInferredFromName: number;
    municipalityUnknown: number;
    industryFromCsv: number;
    industryInferred: number;
    industryNeedsModeration: number;
    organizationsMerged: number;
    programsMerged: number;
    contractRefsExtracted: number;
    datesParsed: number;
    rangesFixed: number;
    readinessZeroActive: number;
  };
}

/** Координаты: только валидные числа в пределах области (lon 35–40, lat 52–56). */
function parseCoordinate(raw: string): number | null {
  const n = parseRuNumber(raw);
  return n === null ? null : n;
}

export function normalizeObjects(table: ObjectsTable): NormalizationResult {
  const objects: NormalizedObject[] = [];
  const stats = {
    total: 0,
    withCoordinates: 0,
    withoutCoordinates: 0,
    withoutAddress: 0,
    municipalityFromColumn: 0,
    municipalityInferredFromAddress: 0,
    municipalityInferredFromName: 0,
    municipalityUnknown: 0,
    industryFromCsv: 0,
    industryInferred: 0,
    industryNeedsModeration: 0,
    organizationsMerged: 0,
    programsMerged: 0,
    contractRefsExtracted: 0,
    datesParsed: 0,
    rangesFixed: 0,
    readinessZeroActive: 0,
  };

  table.rows.forEach((row, index) => {
    const sourceRowNumber = index + 1;
    const flags: string[] = [];
    const get = (col: number): string => row[col] ?? '';

    stats.total += 1;

    // --- наименование, этап, адрес ---
    const name = cleanWhitespace(get(COL.name));
    const constructionStage = nullIfEmpty(get(COL.constructionStage), { zeroIsEmpty: false });
    const addressRaw = nullIfEmpty(get(COL.address), { zeroIsEmpty: false });
    const addressNormalized = addressRaw ? normalizeAddressText(addressRaw) : null;
    if (addressRaw && addressNormalized !== addressRaw) flags.push('адрес нормализован (пробелы/сокращения)');
    if (!addressRaw) {
      stats.withoutAddress += 1;
      flags.push('нет адреса — геокодинг невозможен, требуется геометрия от заказчика');
    }

    // --- координаты (§6.3 п.1: CSV всегда приоритетнее геокодера) ---
    const lat = parseCoordinate(get(COL.lat));
    const lon = parseCoordinate(get(COL.lon));
    const hasCoords = lat !== null && lon !== null;
    if (hasCoords !== (lat !== null || lon !== null)) {
      flags.push('координаты заполнены частично (широта/долгота)');
    }
    if (hasCoords) {
      stats.withCoordinates += 1;
      if (lat !== null && (lat < 52 || lat > 56)) flags.push(`широта вне Тульской области: ${lat}`);
      if (lon !== null && (lon < 35 || lon > 40)) flags.push(`долгота вне Тульской области: ${lon}`);
    } else {
      stats.withoutCoordinates += 1;
    }

    // --- ГРБС, отрасль ---
    const grbsRaw = nullIfEmpty(get(COL.grbs), { zeroIsEmpty: false });
    const grbs = normalizeOrgName(grbsRaw);
    if (grbs.mergedViaAlias) stats.organizationsMerged += 1;
    const industry = normalizeIndustry(get(COL.industry), grbs.canonical);
    if (industry.industrySource === 'csv') stats.industryFromCsv += 1;
    if (industry.industrySource === 'inferred') {
      stats.industryInferred += 1;
      flags.push(`отрасль восстановлена по ГРБС: ${industry.note ?? ''}`);
    }
    if (industry.needsModeration) {
      stats.industryNeedsModeration += 1;
      flags.push(industry.note ?? 'отрасль требует модерации');
    }

    // --- статус ---
    const status = normalizeStatus(get(COL.status));
    if (status.note) flags.push(status.note);

    // --- собственность ---
    const ownership = normalizeOwnership(get(COL.ownership));
    if (ownership === 'unknown') flags.push('собственность не указана (0)');

    // --- МО: колонка → адрес → наименование (§6.1 п.6, §6.3 п.5) ---
    let municipality = normalizeMunicipalityColumn(get(COL.municipality));
    if (municipality.municipalityId) {
      stats.municipalityFromColumn += 1;
      if (municipality.note) flags.push(municipality.note);
    } else {
      const fromAddress = inferMunicipalityFromText(addressRaw ?? addressNormalized);
      if (fromAddress.municipalityId) {
        municipality = { ...fromAddress, municipalitySource: 'inferred_address', confidence: 'medium' };
        stats.municipalityInferredFromAddress += 1;
        flags.push(`МО восстановлено из адреса по НП «${fromAddress.matchedToken}»`);
      } else {
        const fromName = inferMunicipalityFromText(name);
        if (fromName.municipalityId) {
          municipality = { ...fromName, municipalitySource: 'inferred_name', confidence: 'low' };
          stats.municipalityInferredFromName += 1;
          flags.push(`МО восстановлено из наименования по НП «${fromName.matchedToken}» (низкая уверенность)`);
        } else {
          stats.municipalityUnknown += 1;
          flags.push('МО не определено — требуется модерация');
        }
      }
    }

    // --- заказчик/подрядчик ---
    const customer = normalizeOrgName(get(COL.customer));
    const contractor = normalizeOrgName(get(COL.contractor));
    if (customer.mergedViaAlias) stats.organizationsMerged += 1;
    if (contractor.mergedViaAlias) stats.organizationsMerged += 1;
    if (customer.note) flags.push(`заказчик: ${customer.note}`);
    if (contractor.note) flags.push(`подрядчик: ${contractor.note}`);
    const contractorContractRefs = contractor.contractRefs;
    if (contractorContractRefs.length > 0) {
      stats.contractRefsExtracted += contractorContractRefs.length;
      flags.push('из ячейки «Подрядчик» извлечены контрактные реквизиты (сохранены в raw)');
    }

    // --- программы ---
    const programNp = normalizeProgramName(get(COL.programNpGp), PROGRAM_NP_ALIASES);
    const programFp = normalizeProgramName(get(COL.programFp), PROGRAM_FP_ALIASES);
    if (programNp.canonical || programNp.cleaned) {
      if (!programNp.canonical && programNp.cleaned) {
        flags.push(`НП/ГП не сопоставлена со справочником: ${programNp.cleaned.slice(0, 60)}`);
      }
      if (programNp.mergedViaAlias) stats.programsMerged += 1;
      if (programNp.note) flags.push(`НП/ГП: ${programNp.note}`);
    }
    if (programFp.mergedViaAlias) stats.programsMerged += 1;
    if (!programFp.canonical && programFp.cleaned) {
      flags.push(`ФП не сопоставлен со справочником: ${programFp.cleaned.slice(0, 60)}`);
    }

    // --- площадь, мощность ---
    const area = normalizeArea(get(COL.areaM2));
    if (area.zeroInSource) flags.push(area.note ?? 'площадь 0 в источнике');
    const capacity = normalizeCapacity(get(COL.capacity));
    if (capacity.note) flags.push(`мощность: ${capacity.note}`);
    if (
      capacity.value !== null &&
      capacity.unitCode === 'm3_per_day' &&
      capacity.value > 100000
    ) {
      flags.push(`подозрительная мощность водоснабжения: ${capacity.value} м³/сут — проверить источник`);
    }

    // --- экспертиза ---
    const expertise = parseExpertise(get(COL.expertise));
    for (const n of expertise.notes) flags.push(`экспертиза: ${n}`);

    // --- годы и сроки ---
    const yearStartParsed = parseYearOrDate(get(COL.yearStart));
    const yearEndParsed = parseYearOrDate(get(COL.yearEnd));
    if (yearStartParsed.note) flags.push(`год начала: ${yearStartParsed.note}`);
    if (yearEndParsed.note) flags.push(`год окончания: ${yearEndParsed.note}`);
    const constructionPeriod = nullIfEmpty(get(COL.constructionPeriod), { zeroIsEmpty: false });
    const contractPeriod = parseDateRange(get(COL.contractPeriod));
    if (contractPeriod?.note) {
      stats.rangesFixed += 1;
      flags.push(`сроки контракта: ${contractPeriod.note}`);
    }

    // --- даты ---
    const dateFields: Array<[string, string]> = [
      ['дата передачи ЗУ', get(COL.landTransferDate)],
      ['дата РНС', get(COL.permitDate)],
      ['дата контракта', get(COL.contractDate)],
      ['дата установки техоборудования', get(COL.equipmentDate)],
      ['дата гидравлических испытаний', get(COL.hydraulicTestDate)],
      ['дата ЗОС', get(COL.zosDate)],
      ['дата акта ввода', get(COL.actDate)],
    ];
    const parsedDates: Record<string, string | null> = {};
    for (const [label, rawDate] of dateFields) {
      const iso = parseRuDate(rawDate);
      if (!iso && !isBlank(rawDate)) flags.push(`нераспознанная ${label}: ${rawDate}`);
      if (iso) stats.datesParsed += 1;
      parsedDates[label] = iso;
    }

    // --- готовность ---
    const readiness = normalizeReadiness(get(COL.readinessPct));
    if (readiness.note) flags.push(readiness.note);
    if (
      readiness.value === 0 &&
      status.statusGroup &&
      status.statusGroup !== 'completed'
    ) {
      stats.readinessZeroActive += 1;
      flags.push('готовность 0 при активном статусе — работы не начаты');
    }

    // --- ЗОС/акт: номера (в т.ч. «Не требуется») ---
    const zosNumber = nullIfEmpty(get(COL.zosNumber), { zeroIsEmpty: false });
    const actNumber = nullIfEmpty(get(COL.actNumber), { zeroIsEmpty: false });
    if (zosNumber && !/^\d+$/.test(zosNumber) && !/^71-/.test(zosNumber)) {
      flags.push(`ЗОС: нестандартный номер «${zosNumber}» (сохранён как есть)`);
    }
    if (actNumber && actNumber.toLowerCase() === 'не требуется') {
      flags.push('акт ввода: «Не требуется» (сохранено как есть)');
    }

    // --- год ввода ---
    const commissioningYearParsed = parseYearOrDate(get(COL.commissioningYear));
    if (commissioningYearParsed.note) flags.push(`год ввода: ${commissioningYearParsed.note}`);

    // --- колонка «Фото» содержит даты, а не ссылки (§5 ТЗ — ошибка источника) ---
    const photoRaw = nullIfEmpty(get(COL.photo), { zeroIsEmpty: false });
    let photoDate: string | null = null;
    if (photoRaw) {
      photoDate = parseRuDate(photoRaw);
      flags.push(
        photoDate
          ? `колонка «Фото» содержит дату (${photoRaw}), а не ссылку — ошибка источника; сохранено в photo_date`
          : `колонка «Фото» содержит нераспознанное значение: ${photoRaw}`,
      );
    }

    objects.push({
      sourceRowNumber,
      extId: nullIfEmpty(get(COL.extId), { zeroIsEmpty: false }),
      name,
      constructionStage,
      addressRaw,
      addressNormalized,
      lat,
      lon,
      industryCode: industry.industryCode,
      industrySource: industry.industrySource,
      industryNeedsModeration: industry.needsModeration,
      statusCode: status.statusCode,
      statusGroup: status.statusGroup,
      ownership,
      municipalityId: municipality.municipalityId,
      municipalitySource: municipality.municipalitySource,
      municipalityConfidence: municipality.confidence,
      grbsRaw,
      grbsCanonical: grbs.canonical,
      customerRaw: nullIfEmpty(get(COL.customer), { zeroIsEmpty: false }),
      customerCanonical: customer.canonical,
      contractorRaw: nullIfEmpty(get(COL.contractor), { zeroIsEmpty: false }),
      contractorCanonical: contractor.canonical,
      contractorContractRefs,
      programNpRaw: nullIfEmpty(get(COL.programNpGp), { zeroIsEmpty: false }),
      programNpCanonical: programNp.canonical,
      programFpRaw: nullIfEmpty(get(COL.programFp), { zeroIsEmpty: false }),
      programFpCanonical: programFp.canonical ?? programFp.cleaned,
      projectCode: nullIfEmpty(get(COL.projectCode), { zeroIsEmpty: false }),
      areaM2: area.areaM2,
      capacityValue: capacity.value,
      capacityUnitCode: capacity.unitCode,
      capacityParts: capacity.parts,
      capacityRaw: capacity.raw,
      expertise: expertise.records,
      yearStart: yearStartParsed.year,
      yearEnd: yearEndParsed.year,
      constructionPeriod,
      landTransferDate: parsedDates['дата передачи ЗУ'] ?? null,
      permitDate: parsedDates['дата РНС'] ?? null,
      contractDate: parsedDates['дата контракта'] ?? null,
      contractPeriod,
      readinessPct: readiness.value,
      equipmentDate: parsedDates['дата установки техоборудования'] ?? null,
      hydraulicTestDate: parsedDates['дата гидравлических испытаний'] ?? null,
      zosDate: parsedDates['дата ЗОС'] ?? null,
      zosNumber,
      actDate: parsedDates['дата акта ввода'] ?? null,
      actNumber,
      commissioningYear: commissioningYearParsed.year,
      photoDate,
      raw: buildRawRecord(table.rawKeys, row),
      flags,
    });
  });

  return { objects, stats };
}
