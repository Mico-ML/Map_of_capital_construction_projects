import { Injectable, Logger } from '@nestjs/common';
import { createGeocoderProvider, type GeocodeResponse, type GeocoderProvider } from '@oks/etl';
import { createIsochroneProvider } from '../../integrations/2gis/isochrone.provider';
import { createPoiProvider } from '../../integrations/2gis/poi.provider';
import type { RubricSearchResult } from '../../integrations/2gis/types';
import { CacheService } from '../../common/cache.service';
import { loadConfig } from '../../config/env';

/**
 * Сервис гео-прокси (§4.5): единая точка доступа к 2ГИС с кэшем и метриками квот.
 *  - геокодер (Catalog API, §4.3) — кэш 90 суток;
 *  - рубрикатор (Categories API) — для верификации `config/poi_rubrics.ts` (§4.4);
 *  - статусы провайдеров изохрон/POI: сами расчёты — в модуле `isochrone` (§11),
 *    здесь только сводка режимов интеграций, чтобы UI показывал их честно.
 * Ключи 2ГИС не покидают бэкенд и не логируются (§15.11).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly provider: GeocoderProvider;
  private readonly geocodeTtlSec: number;
  private readonly rubricsTtlSec: number;
  private readonly regionId: number;
  /** Счётчик обращений к внешним API (метрика расхода квот, §4.5). */
  private quota = { geocodeCalls: 0, rubricCalls: 0, cacheHits: 0 };

  constructor(private readonly cache: CacheService) {
    const cfg = loadConfig(process.env);
    this.provider = createGeocoderProvider({
      GEOCODER_PROVIDER: cfg.providers.geocoder,
      CATALOG_API_KEY: cfg.catalogApiKey ?? undefined,
    });
    this.geocodeTtlSec = cfg.cache.geocodeTtlDays * 86_400;
    this.rubricsTtlSec = cfg.cache.geocodeTtlDays * 86_400;
    this.regionId = cfg.regionId;
    this.logger.log(`Геокодер-провайдер: ${this.provider.kind}, region_id=${this.regionId}`);
  }

  async geocode(query: string, limit = 10): Promise<GeocodeResponse & { fromCache: boolean; isMock: boolean }> {
    const key = `geocode:${this.regionId}:${limit}:${query.trim().toLowerCase()}`;
    const cached = await this.cache.get<GeocodeResponse>(key);
    if (cached) {
      this.quota.cacheHits += 1;
      return { ...cached, fromCache: true, isMock: this.provider.kind === 'mock' };
    }
    this.quota.geocodeCalls += 1;
    const result = await this.provider.geocode(query);
    if (result.status === 'ok' || result.status === 'not_found') {
      await this.cache.set(key, result, this.geocodeTtlSec);
    }
    return { ...result, fromCache: false, isMock: this.provider.kind === 'mock' };
  }

  /**
   * Рубрикатор 2ГИС (Categories API `2.0/catalog/rubric/search`).
   * Нужен, чтобы сверить `alias`/`id` рубрик региона 36 и заполнить
   * `config/poi_rubrics.ts` перед боевым подключением Search API (§4.4, ROADMAP).
   */
  async rubrics(query: string): Promise<RubricSearchResult & { fromCache: boolean }> {
    const key = `rubrics:${this.regionId}:${query.trim().toLowerCase()}`;
    const cached = await this.cache.get<RubricSearchResult>(key);
    if (cached) {
      this.quota.cacheHits += 1;
      return { ...cached, fromCache: true };
    }
    const cfg = loadConfig(process.env);
    const poi = createPoiProvider({
      POI_PROVIDER: cfg.providers.poi,
      CATALOG_API_KEY: cfg.catalogApiKey ?? undefined,
      REGION_ID: cfg.regionId,
    });
    this.quota.rubricCalls += 1;
    const result = await poi.searchRubrics(query);
    if (result.status === 'ok' || result.status === 'empty') {
      await this.cache.set(key, result, this.rubricsTtlSec);
    }
    return { ...result, fromCache: false };
  }

  /** Режимы интеграций карты/геоданных и метрики расхода квот. */
  providersStatus(): Record<string, unknown> {
    const cfg = loadConfig(process.env);
    return {
      ...cfg.providers,
      geocoder: this.provider.kind,
      // провайдеры создаются только для чтения `kind`; при live без ключа —
      // честно сообщаем о неверной конфигурации, а не падаем с 500
      isochrone: safeKind(() =>
        createIsochroneProvider({
          ISOCHRONE_PROVIDER: cfg.providers.isochrone,
          ROUTING_API_KEY: cfg.routingApiKey ?? undefined,
          ISOCHRONE_MOCK_GEOMETRY: cfg.isochrone.mockGeometry ? 'true' : 'false',
        }),
      ),
      poi: safeKind(() =>
        createPoiProvider({
          POI_PROVIDER: cfg.providers.poi,
          CATALOG_API_KEY: cfg.catalogApiKey ?? undefined,
          REGION_ID: cfg.regionId,
        }),
      ),
      regionId: this.regionId,
      quota: { ...this.quota },
      note:
        'Зоны доступности и отчёт доступности — /api/v1/objects/{id}/isochrone, ' +
        '/api/v1/objects/{id}/accessibility-report, /api/v1/isochrone/*.',
    };
  }

  metrics(): typeof this.quota {
    return { ...this.quota };
  }
}

/** kind провайдера либо 'misconfigured' (live-режим без ключа). */
function safeKind(factory: () => { kind: string }): string {
  try {
    return factory().kind;
  } catch {
    return 'misconfigured';
  }
}
