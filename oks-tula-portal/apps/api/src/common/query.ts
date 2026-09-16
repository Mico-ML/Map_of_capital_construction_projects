import { Transform } from 'class-transformer';

/**
 * Нормализация query-параметров списков.
 *
 * Express отдаёт `?industry=education` строкой, а `?industry=a&industry=b` — массивом;
 * кроме того, deep links портала используют форму `?industry=education,health` (§7 Ф1).
 * Prisma ожидает массив (`{ in: [...] }`), поэтому все списковые фильтры приводятся
 * к массиву одним декоратором — иначе одиночное значение ломает запрос.
 */
export function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string')
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

/** Декоратор `@ListParam()` для полей DTO со списковыми фильтрами. */
export function ListParam(): PropertyDecorator {
  return Transform(({ value }) => toList(value));
}
