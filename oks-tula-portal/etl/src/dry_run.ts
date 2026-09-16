/**
 * «Сухой прогон» ETL без базы данных (§12, итерация 1 — верификация в песочнице).
 *
 * Читает data/raw/objects.csv → парсит → нормализует → прогоняет пайплайн
 * геокодирования (провайдер из GEOCODER_PROVIDER, по умолчанию mock) →
 * формирует отчёт о качестве данных.
 *
 * Артефакты:
 *   reports/data_quality.md       — человекочитаемый отчёт (обязательный артефакт);
 *   reports/data_quality.json     — тот же отчёт для API (/api/v1/data-quality);
 *   data/processed/objects.normalized.json — нормализованные записи (для сверки/сида);
 *   data/processed/geocode_results.json    — результаты пайплайна геокодирования.
 *
 * Запуск: npm run etl:dry   (или: npm run dry --workspace @oks/etl)
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { GeoJsonFeatureCollection } from '@oks/shared';
import { parseObjectsCsv } from './csv_parser';
import { normalizeObjects } from './normalize';
import { loadMunicipalityGeometries } from './geo_utils';
import { createGeocoderProvider } from './geocode/provider';
import { runGeocodePipeline } from './geocode/pipeline';
import { buildQualityReport, renderQualityMarkdown } from './quality';

/** Корень репозитория (etl/src → etl → корень). */
export const REPO_ROOT = resolve(__dirname, '..', '..');

export interface DryRunOptions {
  csvPath?: string;
  geojsonPath?: string;
  reportsDir?: string;
  processedDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DryRunSummary {
  totalObjects: number;
  withCoordinates: number;
  withoutCoordinates: number;
  withoutAddress: number;
  municipalityUnknown: number;
  conflicts: number;
  needsModeration: number;
  reportsMdPath: string;
}

export async function runDryRun(options: DryRunOptions = {}): Promise<DryRunSummary> {
  const env = options.env ?? process.env;
  const csvPath = resolvePath(options.csvPath ?? env.ETL_SOURCE_FILE ?? 'data/raw/objects.csv');
  const geojsonPath = resolvePath(
    options.geojsonPath ?? env.ETL_MUNICIPALITIES_GEOJSON ?? 'data/geo/municipalities.geojson',
  );
  const reportsDir = resolvePath(options.reportsDir ?? 'reports');
  const processedDir = resolvePath(options.processedDir ?? 'data/processed');

  const csvText = readFileSync(csvPath, 'utf-8');
  const sourceFileHash = createHash('sha256').update(csvText).digest('hex');

  // 1. Парсинг и нормализация
  const table = parseObjectsCsv(csvText);
  const normalization = normalizeObjects(table);

  // 2. Геометрии МО + пайплайн геокодирования
  const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8')) as GeoJsonFeatureCollection;
  const geometries = loadMunicipalityGeometries(geojson);
  const provider = createGeocoderProvider({
    GEOCODER_PROVIDER: env.GEOCODER_PROVIDER ?? 'mock',
    CATALOG_API_KEY: env.CATALOG_API_KEY,
  });
  const geocodeResults = await runGeocodePipeline(normalization.objects, provider, geometries);

  // 3. Отчёт о качестве
  const report = buildQualityReport({
    table,
    normalization,
    geocodeResults,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: csvPath,
      sourceFileHash,
      totalRows: normalization.objects.length,
      geocoderProvider: provider.kind,
    },
  });

  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(processedDir, { recursive: true });
  const reportsMdPath = resolve(reportsDir, 'data_quality.md');
  writeFileSync(reportsMdPath, renderQualityMarkdown(report), 'utf-8');
  writeFileSync(resolve(reportsDir, 'data_quality.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(
    resolve(processedDir, 'objects.normalized.json'),
    JSON.stringify(normalization.objects, null, 2),
    'utf-8',
  );
  writeFileSync(resolve(processedDir, 'geocode_results.json'), JSON.stringify(geocodeResults, null, 2), 'utf-8');

  return {
    totalObjects: normalization.objects.length,
    withCoordinates: normalization.stats.withCoordinates,
    withoutCoordinates: normalization.stats.withoutCoordinates,
    withoutAddress: normalization.stats.withoutAddress,
    municipalityUnknown: normalization.stats.municipalityUnknown,
    conflicts: report.geocoding.conflicts.length,
    needsModeration: report.geocoding.needsModeration,
    reportsMdPath,
  };
}

function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

// Запуск как CLI-скрипт
if (require.main === module) {
  runDryRun()
    .then((summary) => {
      console.log('=== ETL: сухой прогон завершён ===');
      console.log(`Объектов:                    ${summary.totalObjects}`);
      console.log(`С координатами (CSV):        ${summary.withCoordinates}`);
      console.log(`Без координат:               ${summary.withoutCoordinates}`);
      console.log(`Без адреса:                  ${summary.withoutAddress}`);
      console.log(`МО не определено:            ${summary.municipalityUnknown}`);
      console.log(`Конфликты геометрии и МО:    ${summary.conflicts}`);
      console.log(`Требует модерации:           ${summary.needsModeration}`);
      console.log(`Отчёт: ${summary.reportsMdPath}`);
    })
    .catch((err: unknown) => {
      console.error('ETL: ошибка сухого прогона', err);
      process.exit(1);
    });
}
