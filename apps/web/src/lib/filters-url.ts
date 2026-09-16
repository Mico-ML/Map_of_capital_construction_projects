import type { ObjectsFilters } from '@oks/shared';

/**
 * Сериализация фильтров в query-параметры URL и обратно (deep linking, §7 Ф1).
 * Ссылку с набором фильтров можно отправить/распечатать; состояние восстанавливается.
 * Списки — через запятую; пустые значения не попадают в URL.
 */

const LIST_KEYS: (keyof ObjectsFilters)[] = [
  'industry',
  'status',
  'statusGroup',
  'municipality',
  'ownership',
  'customer',
  'contractor',
  'grbs',
];
const NUM_KEYS: (keyof ObjectsFilters)[] = ['yearFrom', 'yearTo', 'readinessMin', 'readinessMax', 'page', 'limit'];
const STR_KEYS: (keyof ObjectsFilters)[] = ['q', 'sort', 'bbox', 'near', 'hasGeometry', 'hasMedia', 'hasCamera'];

export function filtersToParams(filters: ObjectsFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = filters[key] as string[] | undefined;
    if (value && value.length) params.set(key, value.join(','));
  }
  for (const key of NUM_KEYS) {
    const value = filters[key] as number | undefined;
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  for (const key of STR_KEYS) {
    const value = filters[key] as string | undefined;
    if (value) params.set(key, value);
  }
  // page=1 не показываем в URL (значение по умолчанию)
  if (params.get('page') === '1') params.delete('page');
  return params;
}

export function paramsToFilters(params: URLSearchParams): ObjectsFilters {
  const filters: ObjectsFilters = {};
  for (const key of LIST_KEYS) {
    const raw = params.get(key);
    if (raw) {
      const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) (filters[key] as string[]) = arr;
    }
  }
  for (const key of NUM_KEYS) {
    const raw = params.get(key);
    if (raw !== null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) (filters[key] as number) = n;
    }
  }
  for (const key of STR_KEYS) {
    const raw = params.get(key);
    if (raw) (filters[key] as string) = raw;
  }
  return { page: 1, limit: 100, sort: 'name', ...filters };
}
