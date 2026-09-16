import type { LoadClass, StatusGroupCode } from '../types/domain';

/**
 * Единая палитра портала (§8 ТЗ). Информация никогда не передаётся только цветом:
 * у каждого класса есть паттерн и текстовый знак для доступности и ч/б-печати.
 */

export interface LoadClassStyle {
  colorHex: string;
  label: string;
  /** Паттерн/иконка для дублирования цветом (доступность, ч/б-печать). */
  pattern: 'hatched' | 'dotted' | 'none';
  symbol: string;
}

/** Палитра «светофора» соцнагрузки (Ф5, Ф7). */
export const LOAD_CLASS_STYLES: Record<LoadClass, LoadClassStyle> = {
  deficit: { colorHex: '#D32F2F', label: 'Дефицит / повышенная нагрузка', pattern: 'hatched', symbol: '!' },
  border: { colorHex: '#F9A825', label: 'Пограничное значение', pattern: 'dotted', symbol: '~' },
  normal: { colorHex: '#7CB342', label: 'Норма', pattern: 'none', symbol: '' },
  surplus: { colorHex: '#2E7D32', label: 'Повышенная обеспеченность', pattern: 'none', symbol: '' },
  no_data: { colorHex: '#BDBDBD', label: 'Нет данных', pattern: 'hatched', symbol: '?' },
};

/** Цвета групп статусов объектов (единая легенда Ф1). */
export const STATUS_GROUP_COLORS: Record<StatusGroupCode, string> = {
  design: '#1565C0',
  construction: '#EF6C00',
  procurement: '#6A1B9A',
  completed: '#2E7D32',
};

/**
 * Формы иконок по отраслям — различимы при ч/б-печати (§8).
 * Ключ — code отрасли из справочника industries.
 */
export const INDUSTRY_ICON_SHAPES: Record<string, 'square' | 'circle' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'cross' | 'pentagon' | 'octagon' | 'shield' | 'drop'> = {
  education: 'square',
  health: 'cross',
  sport: 'circle',
  culture: 'triangle',
  energy: 'star',
  housing_utilities: 'drop',
  construction: 'hexagon',
  social_policy: 'shield',
  it_communications: 'diamond',
  agriculture_ecology: 'pentagon',
  other: 'octagon',
};
