import { describe, expect, it } from 'vitest';
import {
  MIN_APPEALS_FOR_INDEX,
  computeSatisfactionIndex,
} from '../src/utils/satisfaction';
import { hashStringToSeed, mulberry32, randInt } from '../src/utils/rng';

describe('computeSatisfactionIndex (Ф7, формула в одном месте)', () => {
  it('идеальные показатели → около 100', () => {
    const v = computeSatisfactionIndex({
      resolvedShare: 1,
      avgResponseDays: 5,
      overdueShare: 0,
      repeatShare: 0,
      appealsTotal: 50,
    });
    // 0.4·1 + 0.25·1 = 0.65 → нормировка даёт 65 баллов как потолок «честного» индекса
    expect(v).toBe(65);
  });

  it('худшие показатели → около 0', () => {
    const v = computeSatisfactionIndex({
      resolvedShare: 0,
      avgResponseDays: 40,
      overdueShare: 1,
      repeatShare: 1,
      appealsTotal: 50,
    });
    expect(v).toBe(0);
  });

  it('малая выборка (<5 обращений) → null («нет данных»)', () => {
    expect(
      computeSatisfactionIndex({
        resolvedShare: 1,
        avgResponseDays: 1,
        overdueShare: 0,
        repeatShare: 0,
        appealsTotal: MIN_APPEALS_FOR_INDEX - 1,
      }),
    ).toBeNull();
  });

  it('нет данных о времени ответа → нейтральная скорость 0.5', () => {
    const v = computeSatisfactionIndex({
      resolvedShare: 0.8,
      avgResponseDays: null,
      overdueShare: 0.1,
      repeatShare: 0.1,
      appealsTotal: 30,
    });
    // 0.4·0.8 + 0.25·0.5 − 0.2·0.1 − 0.15·0.1 = 0.41 → 41.0
    expect(v).toBe(41);
  });

  it('индекс ограничен диапазоном 0..100', () => {
    const v = computeSatisfactionIndex({
      resolvedShare: 1,
      avgResponseDays: 0,
      overdueShare: 0,
      repeatShare: 0,
      appealsTotal: 1000,
    });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it('монотонность: больше просрочки → ниже индекс', () => {
    const base = { resolvedShare: 0.7, avgResponseDays: 12, repeatShare: 0.1, appealsTotal: 40 };
    const good = computeSatisfactionIndex({ ...base, overdueShare: 0.05 });
    const bad = computeSatisfactionIndex({ ...base, overdueShare: 0.5 });
    expect(good).not.toBeNull();
    expect(bad).not.toBeNull();
    expect(bad!).toBeLessThan(good!);
  });
});

describe('Детерминированный PRNG (Приложение C: фиксированный seed)', () => {
  it('одинаковый seed → одинаковая последовательность', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b());
  });
  it('хэш строки стабилен', () => {
    expect(hashStringToSeed('tula:education')).toBe(hashStringToSeed('tula:education'));
    expect(hashStringToSeed('a')).not.toBe(hashStringToSeed('b'));
  });
  it('randInt в границах', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i += 1) {
      const v = randInt(r, 5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});
