import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_COUNT, parseDelimited, parseObjectsCsv, buildRawRecord } from '../src/csv_parser';

const CSV_PATH = resolve(__dirname, '..', '..', 'data', 'raw', 'objects.csv');
const csvText = readFileSync(CSV_PATH, 'utf-8');

describe('parseDelimited', () => {
  it('простая таблица', () => {
    expect(parseDelimited('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('CRLF и пустые поля', () => {
    expect(parseDelimited('a;;c\r\n1;;3\r\n')).toEqual([
      ['a', '', 'c'],
      ['1', '', '3'],
    ]);
  });
  it('кавычки с экранированием "" и разделителем внутри', () => {
    expect(parseDelimited('"ГУКС ""ТулоблУКС""";2')).toEqual([['ГУКС "ТулоблУКС"', '2']]);
  });
  it('перевод строки внутри quoted-поля', () => {
    expect(parseDelimited('"г. Тула, \nКалужское ш., д. 54";54.1')).toEqual([
      ['г. Тула, \nКалужское ш., д. 54', '54.1'],
    ]);
  });
  it('незакрытая кавычка — ошибка', () => {
    expect(() => parseDelimited('"abc;def')).toThrow(/незакрытая кавычка/i);
  });
});

describe('parseObjectsCsv (реальный файл)', () => {
  const table = parseObjectsCsv(csvText);

  it('95 строк данных, 35 колонок в каждой', () => {
    expect(table.rows).toHaveLength(95);
    for (const row of table.rows) expect(row).toHaveLength(COLUMN_COUNT);
  });

  it('трёхуровневый заголовок: подзаголовки и номера колонок источника', () => {
    expect(table.header[5].trim()).toBe('Координаты');
    expect(table.subheader[5].trim()).toBe('Широта');
    expect(table.subheader[6].trim()).toBe('Долгота');
    expect(table.sourceColumnNumbers[0].trim()).toBe('1');
    // номера колонок источника идут с пропусками (выгрузка из более широкого реестра)
    expect(table.sourceColumnNumbers).toContain('58');
    expect(table.sourceColumnNumbers).toContain('74');
  });

  it('raw-ключи склеивают парные колонки', () => {
    expect(table.rawKeys).toContain('Координаты.Широта');
    expect(table.rawKeys).toContain('ЗОС.дата');
    expect(table.rawKeys).toContain('ЗОС.номер');
    expect(table.rawKeys).toContain('АКТ ВВОДА.дата');
    expect(table.rawKeys).toContain('АКТ ВВОДА.номер');
  });

  it('экранированные кавычки распарсены (строка 1: заказчик ГУКС "ТулоблУКС")', () => {
    const row1 = table.rows[0];
    expect(row1[11]).toBe('ГУКС "ТулоблУКС"');
  });

  it('многострочное поле адреса (строка 37) не рвёт строку', () => {
    const row37 = table.rows[36];
    expect(row37[2]).toContain('Детский сад вместимостью 240 мест');
    expect(row37[4]).toContain('Калужское ш., д. 54');
    expect(row37).toHaveLength(COLUMN_COUNT);
  });

  it('buildRawRecord сохраняет строку целиком', () => {
    const raw = buildRawRecord(table.rawKeys, table.rows[0]);
    expect(Object.keys(raw)).toHaveLength(COLUMN_COUNT);
    expect(raw['Наименование ОКС']).toContain('детского сада на 160 мест');
  });
});
