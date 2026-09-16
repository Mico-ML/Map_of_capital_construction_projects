import type { SphereCode } from '../types/domain';

/** Описание отрасли из нормализованного справочника (Приложение B ТЗ). */
export interface IndustryRef {
  code: string;
  name: string;
  /** Сфера для «светофора» соцнагрузки (Ф5); null — отрасль вне 5 сфер. */
  sphere: SphereCode | null;
  sortOrder: number;
}

/**
 * Нормализованный справочник отраслей (Приложение B).
 * «Жилищно коммунальное хозяйство» (без дефиса) сливается с ЖКХ — см. ETL-алиасы.
 * «Сельское хозяйство и экология» в CSV явно не встречается — выводится из ГРБС.
 */
export const INDUSTRIES: IndustryRef[] = [
  { code: 'education', name: 'Образование', sphere: 'education', sortOrder: 1 },
  { code: 'health', name: 'Здравоохранение', sphere: 'health', sortOrder: 2 },
  { code: 'sport', name: 'Физическая культура и спорт', sphere: 'sport', sortOrder: 3 },
  { code: 'culture', name: 'Культура', sphere: 'culture', sortOrder: 4 },
  { code: 'energy', name: 'Энергетика', sphere: 'energy', sortOrder: 5 },
  { code: 'housing_utilities', name: 'Жилищно-коммунальное хозяйство', sphere: null, sortOrder: 6 },
  { code: 'construction', name: 'Строительство', sphere: null, sortOrder: 7 },
  { code: 'social_policy', name: 'Социальная политика', sphere: null, sortOrder: 8 },
  { code: 'it_communications', name: 'Связь и информатика', sphere: null, sortOrder: 9 },
  { code: 'agriculture_ecology', name: 'Сельское хозяйство и экология', sphere: null, sortOrder: 10 },
  { code: 'other', name: 'Прочее / не указано', sphere: null, sortOrder: 99 },
];

/** Маппинг «исходное значение отрасли из CSV → code» (до нормализации кавычек/пробелов). */
export const INDUSTRY_RAW_TO_CODE: Record<string, string> = {
  'Образование': 'education',
  'Здравоохранение': 'health',
  'Физическая культура и спорт': 'sport',
  'Культура': 'culture',
  'Энергетика': 'energy',
  'Жилищно-коммунальное хозяйство': 'housing_utilities',
  'Жилищно коммунальное хозяйство': 'housing_utilities', // разнобой источника — сливаем
  'Строительство': 'construction',
  'Социальная политика': 'social_policy',
  'Связь и информатика': 'it_communications',
  'Сельское хозяйство и экология': 'agriculture_ecology',
};

/** Сферы «светофора» (Ф5) — порядок и подписи для UI. */
export const SPHERES: { code: SphereCode; name: string }[] = [
  { code: 'education', name: 'Образование' },
  { code: 'health', name: 'Здравоохранение' },
  { code: 'sport', name: 'Спорт' },
  { code: 'energy', name: 'Энергетика' },
  { code: 'culture', name: 'Культура' },
];

export function getIndustryByCode(code: string | null | undefined): IndustryRef | null {
  if (!code) return null;
  return INDUSTRIES.find((i) => i.code === code) ?? null;
}
