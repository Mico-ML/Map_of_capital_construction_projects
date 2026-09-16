/**
 * Детерминированный ГПСЧ для генерации мок-данных (Приложение C ТЗ):
 * «генерация с фиксированным seed, чтобы цифры не прыгали между запусками».
 */

/** mulberry32 — компактный детерминированный PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Устойчивый хэш строки → 32-битный seed (для «seed от идентификатора»). */
export function hashStringToSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Случайное целое в [min, max] из потока rand. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Случайный элемент массива. */
export function randPick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
