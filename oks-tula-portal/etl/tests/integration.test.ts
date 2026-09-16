/**
 * Интеграционный тест ETL на РЕАЛЬНОМ файле data/raw/objects.csv:
 * сверка всех контрольных цифр профиля данных (§5 ТЗ) и правил §6.3.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDryRun, REPO_ROOT } from '../src/dry_run';
import { parseObjectsCsv } from '../src/csv_parser';
import { normalizeObjects } from '../src/normalize';

const csvText = readFileSync(resolve(REPO_ROOT, 'data/raw/objects.csv'), 'utf-8');
const table = parseObjectsCsv(csvText);
const { objects, stats } = normalizeObjects(table);

describe('Профиль данных (§5 ТЗ) — контрольные цифры', () => {
  it('95 объектов', () => {
    expect(objects).toHaveLength(95);
    expect(stats.total).toBe(95);
  });

  it('координаты: 58 из 95; без адреса: 21', () => {
    expect(stats.withCoordinates).toBe(58);
    expect(stats.withoutCoordinates).toBe(37);
    expect(stats.withoutAddress).toBe(21);
  });

  it('статусы: 53/25/13/2/1/1', () => {
    const byCode = new Map(objects.map((o) => [o.statusCode, (byCodeGet(o.statusCode) ?? 0) + 1]));
    function byCodeGet(code: string | null): number | undefined {
      return objects.filter((o) => o.statusCode === code).length || undefined;
    }
    expect(objects.filter((o) => o.statusCode === 'commissioned')).toHaveLength(53);
    expect(objects.filter((o) => o.statusCode === 'smr')).toHaveLength(25);
    expect(objects.filter((o) => o.statusCode === 'pir')).toHaveLength(13);
    expect(objects.filter((o) => o.statusCode === 'pir_smr')).toHaveLength(2);
    expect(objects.filter((o) => o.statusCode === 'ea_preparation')).toHaveLength(1);
    expect(objects.filter((o) => o.statusCode === 'budget_investments')).toHaveLength(1);
    expect(byCode.size).toBeGreaterThan(0);
  });

  it('годы ввода: 2022 — 11, 2023 — 10, 2024 — 14, 2025 — 18', () => {
    const count = (y: number) => objects.filter((o) => o.commissioningYear === y).length;
    expect([count(2022), count(2023), count(2024), count(2025)]).toEqual([11, 10, 14, 18]);
  });

  it('МО: 24 варианта написания → 20 МО; 24 записи без МО восстановлены', () => {
    expect(stats.municipalityFromColumn).toBe(71); // 95 − 24 («0»)
    expect(stats.municipalityInferredFromAddress + stats.municipalityInferredFromName).toBe(24);
    expect(stats.municipalityUnknown).toBe(0);
    const ids = new Set(objects.filter((o) => o.municipalitySource === 'csv_column').map((o) => o.municipalityId));
    expect(ids.size).toBeLessThanOrEqual(20);
  });

  it('отрасль: 8 записей «0»; восстановление по ГРБС + модерация для неоднозначных', () => {
    const zeros = objects.filter((o) => o.raw['Отрасль']?.trim() === '0');
    expect(zeros).toHaveLength(8);
    expect(stats.industryInferred + stats.industryNeedsModeration).toBeGreaterThanOrEqual(8);
    const inferred = zeros.filter((o) => o.industrySource === 'inferred');
    expect(inferred.length).toBeGreaterThan(0);
    for (const o of inferred) expect(o.industryCode).not.toBeNull();
  });

  it('площадь: 60 ненулевых значений, 35 «0» → null', () => {
    expect(objects.filter((o) => o.areaM2 !== null)).toHaveLength(60);
    expect(objects.filter((o) => o.areaM2 === null && o.raw['ОБЩАЯ пл., м2']?.trim() !== '')).toHaveLength(35);
  });

  it('дубли координат: ровно 2 пары (стр. 14/41 и 56/77)', () => {
    const seen = new Map<string, number[]>();
    for (const o of objects) {
      if (o.lat === null || o.lon === null) continue;
      const key = `${o.lat},${o.lon}`;
      seen.set(key, [...(seen.get(key) ?? []), o.sourceRowNumber]);
    }
    const dups = [...seen.values()].filter((rows) => rows.length > 1);
    expect(dups).toHaveLength(2);
    expect(dups.map((d) => d.sort((a, b) => a - b))).toEqual(
      expect.arrayContaining([
        [14, 41],
        [56, 77],
      ]),
    );
  });

  it('колонка «Фото»: 2 записи, обе — даты (ошибка источника)', () => {
    const withPhoto = objects.filter((o) => (o.raw['Фото'] ?? '').trim() !== '');
    expect(withPhoto).toHaveLength(2);
    for (const o of withPhoto) {
      expect(o.photoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.flags.some((f) => f.includes('колонка «Фото» содержит дату'))).toBe(true);
    }
  });

  it('экспертиза: 49 записей, все распарсены с сохранением raw', () => {
    const withExpertise = objects.filter((o) => (o.raw['ЭКСПЕРТИЗА(Ы)'] ?? '').trim() !== '' && (o.raw['ЭКСПЕРТИЗА(Ы)'] ?? '').trim() !== '-');
    expect(withExpertise).toHaveLength(49);
    for (const o of withExpertise) {
      expect(o.expertise.length).toBeGreaterThan(0);
      for (const e of o.expertise) expect(e.raw.length).toBeGreaterThan(0);
    }
  });

  it('подрядчики: дубли кавычек/регистра слиты (СИМВОЛ → один канон)', () => {
    const canon = new Set(objects.map((o) => o.contractorCanonical).filter(Boolean));
    // 53 «сырых» непустых уникальных → 47 после нормализации кавычек (измерение §5)
    // и ~36 после ПОЛНОГО слияния (регистр, опечатки, контрактные реквизиты в ячейке)
    expect(canon.size).toBeLessThanOrEqual(47);
    expect(canon.size).toBeGreaterThanOrEqual(34);
    const simbol = objects.filter((o) => o.contractorCanonical === 'ООО «Символ»');
    expect(simbol.length).toBe(8); // 5 × «СИМВОЛ» + 3 × «Символ»
    const vнешстрой = objects.filter((o) => o.contractorCanonical === 'АО СЗ «Внешстрой»');
    expect(vнешстрой.length).toBe(5);
  });

  it('raw сохранён целиком для каждой строки (трассируемость §6.1 п.9)', () => {
    for (const o of objects) {
      expect(Object.keys(o.raw)).toHaveLength(35);
      expect(o.sourceRowNumber).toBeGreaterThanOrEqual(1);
      expect(o.sourceRowNumber).toBeLessThanOrEqual(95);
    }
  });
});

describe('Сухой прогон: отчёт качества и геокодирование (демо-режим)', () => {
  it('формирует артефакты и ловит конфликт геометрии объекта №7 «Косая гора»', async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'oks-etl-'));
    const summary = await runDryRun({
      reportsDir: resolve(tmp, 'reports'),
      processedDir: resolve(tmp, 'processed'),
      env: { GEOCODER_PROVIDER: 'mock' } as NodeJS.ProcessEnv,
    });

    expect(summary.totalObjects).toBe(95);
    expect(summary.withCoordinates).toBe(58);
    expect(summary.withoutAddress).toBe(21);

    // эталонный кейс контроля качества (§6.3 п.4): объект №7 — точка в Ясногорске
    expect(summary.conflicts).toBeGreaterThanOrEqual(1);
    const report = JSON.parse(readFileSync(resolve(tmp, 'reports/data_quality.json'), 'utf-8')) as {
      geocoding: { conflicts: { rowNumber: number; message: string }[] };
    };
    const row7 = report.geocoding.conflicts.find((c) => c.rowNumber === 7);
    expect(row7).toBeDefined();
    expect(row7?.message).toContain('КОНФЛИКТ ГЕОМЕТРИИ');

    const md = readFileSync(resolve(tmp, 'reports/data_quality.md'), 'utf-8');
    expect(md).toContain('# Отчёт о качестве данных');
    expect(md).toContain('Косая гора');
    expect(md).toContain('SHA-256');

    // демо-режим: координаты не выдумываются — объекты с адресом ждут ключ
    const geocode = JSON.parse(readFileSync(resolve(tmp, 'processed/geocode_results.json'), 'utf-8')) as {
      decision: string;
      point: [number, number] | null;
      geocodeSource: string | null;
    }[];
    expect(geocode).toHaveLength(95);
    const pending = geocode.filter((g) => g.decision === 'pending_key');
    // 37 без координат = 17 с адресом (ждут ключ) + 20 без адреса
    expect(pending.length).toBe(17);
    for (const g of pending) expect(g.point).toBeNull();
    // 20 без адреса = 18 вывод из наименования + 2 с МО из колонки (стр. 66, 71)
    const inferred = geocode.filter((g) => g.decision === 'inferred_from_name');
    expect(inferred.length).toBe(18);
    const centroid = geocode.filter((g) => g.decision === 'municipality_centroid');
    expect(centroid.map((g) => g.sourceRowNumber).sort((a, b) => a - b)).toEqual([66, 71]);
    for (const g of inferred) expect(g.geocodeSource).toBe('inferred_from_name');
    // CSV-координаты сохранены у всех 58, из них 1 конфликт
    expect(geocode.filter((g) => g.geocodeSource === 'csv')).toHaveLength(58);
    expect(geocode.filter((g) => g.decision === 'csv_kept_conflict')).toHaveLength(1);
  }, 60_000);
});
