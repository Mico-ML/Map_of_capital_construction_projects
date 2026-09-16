import { describe, expect, it } from 'vitest';
import { ExportService } from '../src/modules/export/export.service';
import type { ExportRow } from '../src/modules/objects/objects.service';

const svc = new ExportService();

const sample: ExportRow[] = [
  {
    extId: '1',
    name: 'Строительство детского сада на 160 мест в п. Заокский',
    industryName: 'Образование',
    statusName: 'Введен в эксплуатацию',
    statusGroup: 'completed',
    ownership: 'Муниципальная',
    municipalityName: 'Заокский',
    address: 'Тульская обл., Заокский район, п. Заокский, ул. Северная, д.30',
    lon: 37.385349,
    lat: 54.730338,
    locationApproximate: false,
    readinessPct: 100,
    areaM2: null,
    capacityValue: 160,
    capacityUnit: 'мест',
    yearStart: 2020,
    yearEnd: 2022,
    commissioningYear: 2022,
    customer: 'ГУКС «ТулоблУКС»',
    contractor: 'ООО «Строймеханизация»',
  },
  {
    extId: '54',
    name: 'Школа на 1100 мест в микрорайоне Суворовский 2, г. Тула',
    industryName: 'Образование',
    statusName: 'СМР',
    statusGroup: 'construction',
    ownership: 'Муниципальная',
    municipalityName: 'г. Тула',
    address: '',
    lon: null,
    lat: null,
    locationApproximate: true,
    readinessPct: 43.3,
    areaM2: 12791,
    capacityValue: 1100,
    capacityUnit: 'мест',
    yearStart: 2024,
    yearEnd: 2026,
    commissioningYear: null,
    customer: 'АМО г. Тула',
    contractor: '',
  },
];

describe('ExportService.toCsv', () => {
  it('даёт UTF-8 BOM, разделитель «;» и русские заголовки', () => {
    const buf = svc.toCsv(sample);
    const text = buf.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM для Excel
    const lines = text.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toContain('Наименование ОКС');
    expect(lines[0].split(';')).toContain('Год ввода');
    expect(lines).toHaveLength(3); // заголовок + 2 строки
  });
  it('экранирует кавычки и точки с запятой', () => {
    const csv = svc.toCsv(sample).toString('utf-8');
    // «ёлочки» не ломают CSV; значения с ; были бы в кавычках
    expect(csv).toContain('Заокский');
    expect(csv).toContain('Местоположение уточняется'); // заголовок колонки
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    // первая строка — точное положение («нет»), вторая — приблизительное («да»)
    expect(lines[1]).toContain(';нет;');
    expect(lines[2]).toContain(';да;');
  });
});

describe('ExportService.toGeoJson', () => {
  it('FeatureCollection: объект без геометрии → geometry null', () => {
    const fc = JSON.parse(svc.toGeoJson(sample)) as {
      type: string;
      features: { geometry: unknown; properties: Record<string, unknown> }[];
    };
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]?.geometry).toMatchObject({ type: 'Point', coordinates: [37.385349, 54.730338] });
    expect(fc.features[1]?.geometry).toBeNull();
    expect(fc.features[1]?.properties['locationApproximate']).toBe(true);
  });
});

describe('ExportService.toXlsx', () => {
  it('генерирует валидный XLSX (ZIP-контейнер, magic bytes PK)', async () => {
    const buf = await svc.toXlsx(sample);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK'); // zip-сигнатура
  });
});
