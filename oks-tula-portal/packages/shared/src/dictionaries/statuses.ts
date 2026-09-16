import type { StatusGroupCode } from '../types/domain';

/** Описание статуса объекта реестра (Приложение B ТЗ). */
export interface StatusRef {
  code: string;
  /** Наименование как в источнике (нормализованное). */
  name: string;
  group: StatusGroupCode;
  /** Отображаемое название группы. */
  groupLabel: string;
  colorHex: string;
  sortOrder: number;
}

/** Метаданные групп статусов (цвета — §8 ТЗ, единая легенда). */
export const STATUS_GROUPS: Record<StatusGroupCode, { label: string; colorHex: string }> = {
  design: { label: 'Проектирование', colorHex: '#1565C0' },
  construction: { label: 'Строительство', colorHex: '#EF6C00' },
  procurement: { label: 'Закупочные процедуры', colorHex: '#6A1B9A' },
  completed: { label: 'Завершено', colorHex: '#2E7D32' },
};

/**
 * Справочник статусов. Значения — строго из исходного реестра (6 уникальных).
 * code — snake_case-идентификатор для API/БД, name — нормализованное название.
 */
export const STATUSES: StatusRef[] = [
  {
    code: 'commissioned',
    name: 'Введен в эксплуатацию',
    group: 'completed',
    groupLabel: STATUS_GROUPS.completed.label,
    colorHex: STATUS_GROUPS.completed.colorHex,
    sortOrder: 4,
  },
  {
    code: 'smr',
    name: 'СМР',
    group: 'construction',
    groupLabel: STATUS_GROUPS.construction.label,
    colorHex: STATUS_GROUPS.construction.colorHex,
    sortOrder: 2,
  },
  {
    code: 'pir',
    name: 'ПИР',
    group: 'design',
    groupLabel: STATUS_GROUPS.design.label,
    colorHex: STATUS_GROUPS.design.colorHex,
    sortOrder: 1,
  },
  {
    code: 'pir_smr',
    name: 'ПИР+СМР',
    group: 'construction',
    groupLabel: 'Строительство (с проектированием)',
    colorHex: STATUS_GROUPS.construction.colorHex,
    sortOrder: 3,
  },
  {
    code: 'ea_preparation',
    name: 'Подготовка электронного аукциона (ЭА)',
    group: 'procurement',
    groupLabel: STATUS_GROUPS.procurement.label,
    colorHex: STATUS_GROUPS.procurement.colorHex,
    sortOrder: 5,
  },
  {
    code: 'budget_investments',
    name: 'Бюджетные инвестиции',
    group: 'procurement',
    groupLabel: 'Бюджетные инвестиции',
    colorHex: STATUS_GROUPS.procurement.colorHex,
    sortOrder: 6,
  },
];

/** Маппинг «исходное значение статуса → code» (точные строки из CSV). */
export const STATUS_RAW_TO_CODE: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.name, s.code]),
);

export function getStatusByCode(code: string | null | undefined): StatusRef | null {
  if (!code) return null;
  return STATUSES.find((s) => s.code === code) ?? null;
}
