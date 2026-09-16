import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { ExportRow } from '../objects/objects.service';

/** Русские заголовки колонок экспорта (единый порядок для CSV/XLSX). */
const COLUMNS: { key: keyof ExportRow; title: string; width: number }[] = [
  { key: 'extId', title: '№ п/п', width: 8 },
  { key: 'name', title: 'Наименование ОКС', width: 60 },
  { key: 'industryName', title: 'Отрасль', width: 28 },
  { key: 'statusName', title: 'Статус', width: 24 },
  { key: 'ownership', title: 'Собственность', width: 18 },
  { key: 'municipalityName', title: 'Муниципальное образование', width: 22 },
  { key: 'address', title: 'Адрес', width: 40 },
  { key: 'lat', title: 'Широта', width: 12 },
  { key: 'lon', title: 'Долгота', width: 12 },
  { key: 'locationApproximate', title: 'Местоположение уточняется', width: 16 },
  { key: 'readinessPct', title: 'Готовность, %', width: 12 },
  { key: 'areaM2', title: 'Общая площадь, м²', width: 16 },
  { key: 'capacityValue', title: 'Мощность', width: 12 },
  { key: 'capacityUnit', title: 'Ед. мощности', width: 16 },
  { key: 'yearStart', title: 'Год начала', width: 12 },
  { key: 'yearEnd', title: 'Год окончания', width: 12 },
  { key: 'commissioningYear', title: 'Год ввода', width: 12 },
  { key: 'customer', title: 'Заказчик', width: 34 },
  { key: 'contractor', title: 'Подрядчик', width: 34 },
];

@Injectable()
export class ExportService {
  /** CSV (разделитель «;», UTF-8 BOM для Excel). */
  toCsv(rows: ExportRow[]): Buffer {
    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[;"\n]/.test(s) ? `"${s}"` : s;
    };
    const head = COLUMNS.map((c) => esc(c.title)).join(';');
    const lines = rows.map((r) =>
      COLUMNS.map((c) => esc(c.key === 'locationApproximate' ? (r[c.key] ? 'да' : 'нет') : r[c.key])).join(';'),
    );
    return Buffer.from(`\uFEFF${[head, ...lines].join('\r\n')}`, 'utf-8');
  }

  /** GeoJSON FeatureCollection (точки; объекты без геометрии — Feature с null geometry). */
  toGeoJson(rows: ExportRow[]): string {
    const features = rows.map((r) => ({
      type: 'Feature',
      geometry: r.lon !== null && r.lat !== null ? { type: 'Point', coordinates: [r.lon, r.lat] } : null,
      properties: {
        extId: r.extId,
        name: r.name,
        industry: r.industryName,
        status: r.statusName,
        ownership: r.ownership,
        municipality: r.municipalityName,
        address: r.address,
        locationApproximate: r.locationApproximate,
        readinessPct: r.readinessPct,
        areaM2: r.areaM2,
        capacityValue: r.capacityValue,
        capacityUnit: r.capacityUnit,
        yearStart: r.yearStart,
        yearEnd: r.yearEnd,
        commissioningYear: r.commissioningYear,
        customer: r.customer,
        contractor: r.contractor,
      },
    }));
    return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  }

  /** XLSX через exceljs (настоящая книга Excel). */
  async toXlsx(rows: ExportRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Портал ОКС Тульской области';
    wb.created = new Date();
    const ws = wb.addWorksheet('Объекты ОКС', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNS.map((c) => ({ header: c.title, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        ...r,
        locationApproximate: r.locationApproximate ? 'да' : 'нет',
      });
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
