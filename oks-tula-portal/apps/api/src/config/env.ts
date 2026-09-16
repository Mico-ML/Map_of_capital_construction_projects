/**
 * Типизированная конфигурация из переменных окружения (§1 ТЗ: секреты только в env).
 * Читается один раз при старте; отсутствие критичных значений — явная ошибка.
 */

import {
  BATCH_MAX_OBJECTS,
  ISOCHRONE_TTL_DAYS_DEFAULT,
  POI_TTL_DAYS_DEFAULT,
  SEARCH_MAX_PAGES,
} from '@oks/shared';

export type ProviderMode = 'mock' | 'live';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  apiPort: number;
  corsOrigins: string[];
  databaseUrl: string;
  mediaDir: string;
  mediaMaxFileMb: number;
  logLevel: string;
  regionId: number;
  // ключи 2ГИС (секретные — никогда не логируются, см. §15.11)
  mapglKeyPresent: boolean;
  routingApiKey: string | null;
  catalogApiKey: string | null;
  providers: {
    geocoder: ProviderMode;
    isochrone: ProviderMode;
    poi: ProviderMode;
    procurement: ProviderMode;
    feedback: ProviderMode;
    camera: ProviderMode;
    imagery: ProviderMode;
    population: ProviderMode;
    appeals: ProviderMode;
    boundaries: ProviderMode | 'osm';
  };
  cache: {
    isochroneTtlDays: number;
    poiTtlDays: number;
    geocodeTtlDays: number;
    maxEntries: number;
  };
  isochrone: {
    /** Демо-модель геометрии зон при ISOCHRONE_PROVIDER=mock (false — честное «Нет данных»). */
    mockGeometry: boolean;
    /** Максимум объектов в пакетном построении зон (Ф4). */
    batchMaxObjects: number;
    /** Радиус поиска объектов той же сферы для отчёта доступности, м. */
    peersRadiusM: number;
    /** Максимум страниц Search API на один запрос рубрики (защита квоты). */
    poiMaxPages: number;
  };
  rateLimit: {
    geoPerMin: number;
    appealsPer10Min: number;
  };
  jwtSecret: string | null;
  reportsDir: string;
}

function num(value: string | undefined, def: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : def;
}

function providerMode(value: string | undefined, def: ProviderMode = 'mock'): ProviderMode {
  return value === 'live' ? 'live' : value === 'mock' ? 'mock' : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: (env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    apiPort: num(env.API_PORT, 3000),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:8080,http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL ?? '',
    mediaDir: env.MEDIA_DIR ?? '/var/data/media',
    mediaMaxFileMb: num(env.MEDIA_MAX_FILE_MB, 10),
    logLevel: env.LOG_LEVEL ?? 'info',
    regionId: num(env.REGION_ID, 36),
    mapglKeyPresent: Boolean(env.VITE_MAPGL_KEY),
    routingApiKey: env.ROUTING_API_KEY || null,
    catalogApiKey: env.CATALOG_API_KEY || null,
    providers: {
      geocoder: providerMode(env.GEOCODER_PROVIDER),
      isochrone: providerMode(env.ISOCHRONE_PROVIDER),
      poi: providerMode(env.POI_PROVIDER),
      procurement: providerMode(env.PROCUREMENT_PROVIDER),
      feedback: providerMode(env.FEEDBACK_PROVIDER),
      camera: providerMode(env.CAMERA_PROVIDER),
      imagery: providerMode(env.IMAGERY_PROVIDER),
      population: providerMode(env.POPULATION_PROVIDER),
      appeals: providerMode(env.APPEALS_PROVIDER),
      boundaries: (env.BOUNDARIES_PROVIDER as 'mock' | 'osm') ?? 'osm',
    },
    cache: {
      isochroneTtlDays: num(env.CACHE_TTL_ISOCHRONE_DAYS, ISOCHRONE_TTL_DAYS_DEFAULT),
      poiTtlDays: num(env.CACHE_TTL_POI_DAYS, POI_TTL_DAYS_DEFAULT),
      geocodeTtlDays: num(env.CACHE_TTL_GEOCODE_DAYS, 90),
      maxEntries: num(env.CACHE_MAX_ENTRIES, 1000),
    },
    isochrone: {
      mockGeometry: (env.ISOCHRONE_MOCK_GEOMETRY ?? 'true').toLowerCase() !== 'false',
      batchMaxObjects: num(env.ISOCHRONE_BATCH_MAX_OBJECTS, BATCH_MAX_OBJECTS),
      peersRadiusM: num(env.ISOCHRONE_PEERS_RADIUS_M, 20_000),
      poiMaxPages: num(env.POI_MAX_PAGES, SEARCH_MAX_PAGES),
    },
    rateLimit: {
      geoPerMin: num(env.RATE_LIMIT_GEO_PER_MIN, 30),
      appealsPer10Min: num(env.RATE_LIMIT_APPEALS_PER_10MIN, 3),
    },
    jwtSecret: env.JWT_SECRET || null,
    reportsDir: env.REPORTS_DIR ?? 'reports',
  };
}

/** Перечень интеграций, работающих в демо-режиме (для честного бейджа в UI и health). */
export function mockProviders(cfg: AppConfig): string[] {
  const list: string[] = [];
  for (const [name, mode] of Object.entries(cfg.providers)) {
    if (mode === 'mock') list.push(name);
  }
  return list;
}
