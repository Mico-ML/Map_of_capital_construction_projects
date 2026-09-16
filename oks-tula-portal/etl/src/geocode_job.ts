/**
 * Отдельная джоба геокодирования (§6.3): перечитать нормализованные объекты
 * и прогнать пайплайн с текущим провайдером. Используется после получения
 * боевого CATALOG_API_KEY (GEOCODER_PROVIDER=live npm run etl:geocode) —
 * результаты пишутся в data/processed/geocode_results.json и далее
 * применяются загрузчиком (apps/api prisma/seed) с учётом manual_override.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { GeoJsonFeatureCollection } from '@oks/shared';
import type { NormalizedObject } from './normalize';
import { loadMunicipalityGeometries } from './geo_utils';
import { createGeocoderProvider } from './geocode/provider';
import { runGeocodePipeline, type ObjectGeocodeResult } from './geocode/pipeline';
import { REPO_ROOT } from './dry_run';

function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

export async function runGeocodeJob(env: NodeJS.ProcessEnv = process.env): Promise<ObjectGeocodeResult[]> {
  const normalizedPath = resolvePath(env.ETL_NORMALIZED_JSON ?? 'data/processed/objects.normalized.json');
  const geojsonPath = resolvePath(env.ETL_MUNICIPALITIES_GEOJSON ?? 'data/geo/municipalities.geojson');
  const objects = JSON.parse(readFileSync(normalizedPath, 'utf-8')) as NormalizedObject[];
  const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8')) as GeoJsonFeatureCollection;
  const geometries = loadMunicipalityGeometries(geojson);
  const provider = createGeocoderProvider({
    GEOCODER_PROVIDER: env.GEOCODER_PROVIDER ?? 'mock',
    CATALOG_API_KEY: env.CATALOG_API_KEY,
  });
  const maxLive = env.GEOCODE_MAX_LIVE_REQUESTS ? Number(env.GEOCODE_MAX_LIVE_REQUESTS) : undefined;
  const results = await runGeocodePipeline(objects, provider, geometries, { maxLiveRequests: maxLive });

  const outPath = resolvePath(env.ETL_GEOCODE_RESULTS ?? 'data/processed/geocode_results.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');

  const byDecision: Record<string, number> = {};
  for (const r of results) byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
  console.log('=== Джоба геокодирования завершена ===');
  console.log(`Провайдер: ${provider.kind}`);
  console.log('Решения:', JSON.stringify(byDecision, null, 2));
  console.log(`Результаты: ${outPath}`);
  return results;
}

if (require.main === module) {
  runGeocodeJob().catch((err: unknown) => {
    console.error('Джоба геокодирования: ошибка', err);
    process.exit(1);
  });
}
