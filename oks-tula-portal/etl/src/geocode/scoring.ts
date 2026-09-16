/**
 * Скоринг кандидатов геокодера — строго по §6.3 ТЗ:
 *   район (+3) → населённый пункт (+3) → улица (+2) → номер дома (+1);
 *   несовпадение района (−3).
 * Уровни доверия:
 *   high   — score ≥ 6 И преимущество перед вторым кандидатом;
 *   medium — score ≥ 5;
 *   low    — score ≥ 1;
 *   иначе  — rejected.
 * Валидация по цепочке adm_div: кандидат принимается только при совпадении
 * района/городского округа с ожидаемым МО; несовпадение → rejected с причиной.
 */

import type { GeocodeConfidence } from '@oks/shared';
import type { ExpectedLocation, GeocodeCandidate } from './types';

export interface ScoredCandidate {
  candidate: GeocodeCandidate;
  score: number;
  breakdown: {
    districtMatch: 'match' | 'mismatch' | 'unknown';
    settlementMatch: boolean;
    streetMatch: boolean;
    houseMatch: boolean;
  };
  rejectReason?: string;
}

export interface ScoringResult {
  best: ScoredCandidate | null;
  confidence: GeocodeConfidence | null;
  scored: ScoredCandidate[];
}

/** Родовые слова, отсекаемые при нормализации названий мест. */
const PLACE_STOP_WORDS = new Set([
  'городской', 'округ', 'муниципальный', 'муниципального', 'район', 'р-н',
  'город', 'рабочий', 'поселок', 'посёлок', 'село', 'деревня',
  'рп', 'пгт', 'г', 'п', 'с', 'д', 'ул', 'улица', 'проспект', 'пр-т', 'пр',
  'шоссе', 'ш', 'переулок', 'пер', 'микрорайон', 'мкр',
  'область', 'обл', 'тульской', 'области',
]);

/** Нормализация названия для сравнения: нижний регистр, ё→е, без родовых слов и пунктуации. */
export function normalizePlaceName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !PLACE_STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

/** Совпадение названий: точное, либо одно содержит другое (по словоформам). */
function namesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePlaceName(a);
  const nb = normalizePlaceName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // «киреевский район» vs «киреевский», «венев» vs «венёвский»
  const stemA = na.replace(/(ский|ской|ая|ое|ий|ов|ев|ин|ск|ий)$/u, '');
  const stemB = nb.replace(/(ский|ской|ая|ое|ий|ов|ев|ин|ск|ий)$/u, '');
  if (stemA.length >= 4 && stemB.length >= 4) {
    if (stemA.startsWith(stemB) || stemB.startsWith(stemA)) return true;
  }
  return na.includes(nb) || nb.includes(na);
}

/** Сравнение номера дома: «8Б» ≈ «8б» ≈ «8». */
function housesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = a.toLowerCase().replace(/[^0-9a-zа-я]/g, '');
  const nb = b.toLowerCase().replace(/[^0-9a-zа-я]/g, '');
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

const DISTRICT_TYPES = new Set([
  'district',
  'district_area',
  'urban_district',
  'municipality',
  'city_district',
  'okrug',
]);

/**
 * Оценка одного кандидата относительно ожидаемого местоположения.
 * Если ожидаемое МО задано и в adm_div нет совпадающего района/округа →
 * кандидат отклоняется (§6.3 п.2: «Несовпадение → rejected с фиксацией причины»).
 */
export function scoreCandidate(candidate: GeocodeCandidate, expected: ExpectedLocation): ScoredCandidate {
  let score = 0;
  const admNames = candidate.admDiv.map((d) => d.name);
  const admTypes = candidate.admDiv.map((d) => (d.type ?? '').toLowerCase());

  // --- район / городской округ (±3) ---
  let districtMatch: 'match' | 'mismatch' | 'unknown' = 'unknown';
  if (expected.municipalityNames.length > 0) {
    const matched = expected.municipalityNames.some((name) =>
      candidate.admDiv.some((div) => namesAgree(div.name, name)),
    );
    if (matched) {
      districtMatch = 'match';
      score += 3;
    } else {
      // ожидаем район, но среди adm_div есть ДРУГИЕ районы области → явное несовпадение
      const hasDistrictLevel = admTypes.some((t) => DISTRICT_TYPES.has(t));
      if (hasDistrictLevel || admNames.length > 0) {
        districtMatch = 'mismatch';
        score -= 3;
      }
    }
  }

  // --- населённый пункт (+3) ---
  // только по явному компоненту адреса кандидата: adm_div района НЕ считается
  // совпадением НП (иначе район «Ясногорский» ложно матчил бы НП «Ясногорск»)
  const settlementMatch = namesAgree(candidate.components?.settlement ?? null, expected.settlement);
  if (settlementMatch) score += 3;

  // --- улица (+2) ---
  const streetMatch = namesAgree(candidate.components?.street ?? null, expected.street) ||
    (expected.street !== null && normalizePlaceName(candidate.addressName).includes(normalizePlaceName(expected.street)) && normalizePlaceName(expected.street).length > 0);
  if (streetMatch) score += 2;

  // --- номер дома (+1) ---
  const houseMatch = housesAgree(candidate.components?.house ?? null, expected.house);
  if (houseMatch) score += 1;

  const result: ScoredCandidate = {
    candidate,
    score,
    breakdown: { districtMatch, settlementMatch, streetMatch, houseMatch },
  };
  if (districtMatch === 'mismatch') {
    result.rejectReason =
      'район/городской округ кандидата не совпадает с ожидаемым МО (возможная подмена одноимённой улицы)';
  }
  return result;
}

/**
 * Выбор лучшего кандидата из списка (§6.3 п.3).
 * Отвергнутые по району кандидаты не побеждают ни при каком score.
 */
export function selectBestCandidate(scored: ScoredCandidate[]): ScoringResult {
  const valid = scored
    .filter((s) => !s.rejectReason)
    .sort((a, b) => b.score - a.score);
  if (valid.length === 0) return { best: null, confidence: null, scored };

  const best = valid[0];
  const second = valid[1];
  const margin = second ? best.score - second.score : best.score;

  let confidence: GeocodeConfidence | null = null;
  if (best.score >= 6 && margin >= 1) confidence = 'high';
  else if (best.score >= 5) confidence = 'medium';
  else if (best.score >= 1) confidence = 'low';

  if (!confidence) return { best: null, confidence: null, scored };
  return { best, confidence, scored };
}
