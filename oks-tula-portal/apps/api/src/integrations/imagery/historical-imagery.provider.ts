/**
 * HistoricalImageryProvider (§10, §7 Ф3): слой архивных снимков «До».
 * У 2ГИС архива снимков нет (§4.5) — реальные мозаики Sentinel-2 (с 2015, 10 м) /
 * Landsat (с 1984, 30 м) публикуются на собственном WMS/WMTS (GeoServer) и
 * подключаются в MapGL через RasterTileSource (URL-функция от x,y,zoom,bbox; EPSG:3857),
 * с обязательным attribution источника. Процедура подготовки — docs/IMAGERY.md.
 *
 * MVP: MockHistoricalImageryProvider возвращает конфиг слоя-заглушки (isMock),
 * реальные тайлы не подменяются выдуманными снимками.
 */

export type ImagerySource = 'sentinel2' | 'landsat' | 'archive' | 'mock';

export interface HistoricalImageryLayer {
  source: ImagerySource;
  year: number;
  /** Шаблон URL тайла WMS/WMTS с плейсхолдерами {x} {y} {z} и {bbox} (EPSG:3857). */
  urlTemplate: string | null;
  attribution: string;
  isMock: boolean;
}

export interface HistoricalImageryProvider {
  readonly kind: 'mock' | 'live';
  /** Годы, за которые есть снимки по объекту/области. */
  availableYears(): Promise<number[]>;
  /** Конфигурация слоя для подключения в MapGL RasterTileSource. */
  getLayer(year: number): Promise<HistoricalImageryLayer | null>;
}

/** Демо-провайдер: годы-заглушки, URL отсутствует (реальных снимков не выдумываем). */
export class MockHistoricalImageryProvider implements HistoricalImageryProvider {
  readonly kind = 'mock' as const;

  async availableYears(): Promise<number[]> {
    // Sentinel-2 доступен с 2015; в демо показываем диапазон без реальных тайлов
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let y = 2015; y <= now; y += 1) years.push(y);
    return years;
  }

  async getLayer(year: number): Promise<HistoricalImageryLayer> {
    return {
      source: 'mock',
      year,
      urlTemplate: null,
      attribution:
        'Демо-режим: архивные снимки не подключены. Реальный источник — Sentinel-2 (ESA) / Landsat (USGS) через WMS (см. docs/IMAGERY.md).',
      isMock: true,
    };
  }
}

export interface WmsImageryOptions {
  /** Базовый URL WMS/WMTS (GeoServer), например https://geo.example.ru/geoserver/ows. */
  baseUrl: string;
  /** Шаблон имени слоя по году, например 'sentinel2:s2_{year}_mosaic'. */
  layerTemplate: string;
  attribution: string;
}

/**
 * Боевой провайдер: строит WMS GetMap URL для RasterTileSource.
 * Требует подготовленных мозаик (docs/IMAGERY.md) и IMAGERY_PROVIDER=live.
 */
export class WmsHistoricalImageryProvider implements HistoricalImageryProvider {
  readonly kind = 'live' as const;
  constructor(private readonly opts: WmsImageryOptions) {}

  async availableYears(): Promise<number[]> {
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let y = 2015; y <= now; y += 1) years.push(y);
    return years;
  }

  async getLayer(year: number): Promise<HistoricalImageryLayer> {
    const layer = this.opts.layerTemplate.replace('{year}', String(year));
    // RasterTileSource 2ГИС ожидает URL-функцию; здесь — шаблон с {bbox}/{z}/{x}/{y}
    const urlTemplate =
      `${this.opts.baseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
      `&LAYERS=${encodeURIComponent(layer)}&STYLES=&CRS=EPSG:3857` +
      `&WIDTH=256&HEIGHT=256&FORMAT=image/png&BBOX={bbox}`;
    return { source: 'sentinel2', year, urlTemplate, attribution: this.opts.attribution, isMock: false };
  }
}

export function createHistoricalImageryProvider(env: {
  IMAGERY_PROVIDER?: string;
  IMAGERY_WMS_URL?: string;
  IMAGERY_WMS_LAYER?: string;
}): HistoricalImageryProvider {
  if (env.IMAGERY_PROVIDER === 'live' && env.IMAGERY_WMS_URL) {
    return new WmsHistoricalImageryProvider({
      baseUrl: env.IMAGERY_WMS_URL,
      layerTemplate: env.IMAGERY_WMS_LAYER ?? 'sentinel2:s2_{year}_mosaic',
      attribution: '© Sentinel-2 (ESA) / Landsat (USGS), обработка — Министерство строительства Тульской области',
    });
  }
  return new MockHistoricalImageryProvider();
}
