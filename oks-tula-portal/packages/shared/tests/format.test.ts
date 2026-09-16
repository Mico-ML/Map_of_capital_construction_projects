import { describe, expect, it } from 'vitest';
import {
  NBSP,
  formatDateRu,
  formatNumberRu,
  formatAreaM2,
  formatPercent,
  pluralRu,
  formatDateRangeRu,
} from '../src/utils/format';

describe('formatDateRu', () => {
  it('форматирует ISO-дату в ДД.ММ.ГГГГ', () => {
    expect(formatDateRu('2022-10-28')).toBe('28.10.2022');
  });
  it('принимает datetime с временем', () => {
    expect(formatDateRu('2025-12-10T15:04:05Z')).toBe('10.12.2025');
  });
  it('пустые значения → null (в UI «Нет данных»)', () => {
    expect(formatDateRu(null)).toBeNull();
    expect(formatDateRu(undefined)).toBeNull();
    expect(formatDateRu('')).toBeNull();
  });
  it('мусор → null, а не NaN', () => {
    expect(formatDateRu('не дата')).toBeNull();
  });
});

describe('formatNumberRu', () => {
  it('разделитель тысяч — неразрывный пробел', () => {
    expect(formatNumberRu(12791)).toBe(`12${NBSP}791`);
    expect(formatNumberRu(184464)).toBe(`184${NBSP}464`);
  });
  it('дробные — запятая', () => {
    expect(formatNumberRu(13572.8, 2)).toBe(`13${NBSP}572,80`);
  });
  it('null → null', () => {
    expect(formatNumberRu(null)).toBeNull();
  });
});

describe('formatAreaM2 / formatPercent', () => {
  it('площадь с суффиксом', () => {
    expect(formatAreaM2(5556)).toBe(`5${NBSP}556${NBSP}м²`);
  });
  it('процент', () => {
    expect(formatPercent(88.5)).toBe(`88,5${NBSP}%`);
  });
});

describe('pluralRu', () => {
  const forms: [string, string, string] = ['объект', 'объекта', 'объектов'];
  it('склоняет корректно', () => {
    expect(pluralRu(1, forms)).toBe(`1${NBSP}объект`);
    expect(pluralRu(2, forms)).toBe(`2${NBSP}объекта`);
    expect(pluralRu(5, forms)).toBe(`5${NBSP}объектов`);
    expect(pluralRu(11, forms)).toBe(`11${NBSP}объектов`);
    expect(pluralRu(21, forms)).toBe(`21${NBSP}объект`);
    expect(pluralRu(95, forms)).toBe(`95${NBSP}объектов`);
  });
});

describe('formatDateRangeRu', () => {
  it('диапазон', () => {
    expect(formatDateRangeRu('2022-09-15', '2022-10-28')).toBe('15.09.2022 – 28.10.2022');
  });
  it('одинаковые даты не дублируются', () => {
    expect(formatDateRangeRu('2022-10-28', '2022-10-28')).toBe('28.10.2022');
  });
  it('частичный диапазон', () => {
    expect(formatDateRangeRu(null, '2023-03-31')).toBe('31.03.2023');
  });
});
