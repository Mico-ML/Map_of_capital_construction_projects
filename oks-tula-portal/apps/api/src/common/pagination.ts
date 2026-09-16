import type { Paginated } from '@oks/shared';

/** Нормализация параметров пагинации (защита от злоупотребления limit). */
export function normalizePagination(page?: number, limit?: number): { page: number; limit: number; skip: number } {
  const p = Math.max(1, Math.trunc(page ?? 1));
  const l = Math.min(200, Math.max(1, Math.trunc(limit ?? 100)));
  return { page: p, limit: l, skip: (p - 1) * l };
}

/** Сборка ответа с пагинацией (§11: единый формат `{ items, total, page, limit }`). */
export function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, total, page, limit };
}
