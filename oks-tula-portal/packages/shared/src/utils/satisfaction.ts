/**
 * Формула индекса удовлетворённости граждан (Ф7).
 * Реализована в ОДНОМ месте (ядро — shared, обёртка — services/satisfaction
 * бэкенда), покрыта unit-тестами; параметры и веса — в config/thresholds.
 * Методика публикуется в docs/METHODOLOGY.md и в тултипе UI.
 */

import { SATISFACTION_WEIGHTS } from '../config/thresholds';

export interface SatisfactionInput {
  /** Доля решённых/положительных ответов, 0..1. */
  resolvedShare: number | null;
  /** Медианное время ответа, дней. */
  avgResponseDays: number | null;
  /** Доля просроченных ответов, 0..1. */
  overdueShare: number | null;
  /** Доля повторных обращений, 0..1. */
  repeatShare: number | null;
  /** Число обращений (для исключения малых выборок). */
  appealsTotal: number;
}

/** Минимальное число обращений, при котором индекс считается репрезентативным. */
export const MIN_APPEALS_FOR_INDEX = 5;

/**
 * satisfaction_index = w1·доля решённых + w2·скорость ответа − w3·просрочка − w4·повторные.
 * Результат 0..100 (округление до 1 знака). При малой выборке — null («нет данных»).
 */
export function computeSatisfactionIndex(input: SatisfactionInput): number | null {
  if (input.appealsTotal < MIN_APPEALS_FOR_INDEX) return null;
  const w = SATISFACTION_WEIGHTS;

  const resolved = input.resolvedShare ?? 0;
  // линейная шкала скорости: targetResponseDays → 1, maxAcceptableResponseDays → 0
  let speed = 0.5; // нейтраль, если данных о времени нет
  if (input.avgResponseDays !== null) {
    const span = w.maxAcceptableResponseDays - w.targetResponseDays;
    speed = (w.maxAcceptableResponseDays - input.avgResponseDays) / span;
    speed = Math.min(1, Math.max(0, speed));
  }
  const overdue = input.overdueShare ?? 0;
  const repeat = input.repeatShare ?? 0;

  const raw =
    w.resolvedShare * resolved +
    w.responseTimeScore * speed -
    w.overduePenalty * overdue -
    w.repeatPenalty * repeat;
  const index = Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 10;
  return index;
}

/** Человекочитаемое описание методики — для тултипов UI и docs/METHODOLOGY.md. */
export const SATISFACTION_METHODOLOGY_TEXT =
  'Индекс 0–100 = 0,4·доля решённых обращений + 0,25·скорость ответа ' +
  '(10 дней — максимум, 30 дней — ноль) − 0,2·доля просроченных − 0,15·доля повторных. ' +
  'При числе обращений < 5 индекс не рассчитывается («нет данных»). Веса согласуются заказчиком.';
