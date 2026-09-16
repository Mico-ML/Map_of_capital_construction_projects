import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHistoricalImageryProvider } from '../../integrations/imagery/historical-imagery.provider';
import { createCameraProvider } from '../../integrations/camera/camera.provider';
import { loadConfig } from '../../config/env';

/**
 * Статус интеграций «До»-снимков и камер (Ф3). Показывает режим (mock/live),
 * доступные годы архивных снимков и attribution — честно, без имитации данных.
 */
@ApiTags('Архивные снимки и камеры (Ф3)')
@Controller('imagery')
export class ImageryController {
  @Get('status')
  @ApiOperation({ summary: 'Режим HistoricalImagery/Camera провайдеров и доступные годы снимков' })
  async status() {
    const cfg = loadConfig(process.env);
    const imagery = createHistoricalImageryProvider({
      IMAGERY_PROVIDER: cfg.providers.imagery,
      IMAGERY_WMS_URL: process.env.IMAGERY_WMS_URL,
      IMAGERY_WMS_LAYER: process.env.IMAGERY_WMS_LAYER,
    });
    const camera = createCameraProvider({ CAMERA_PROVIDER: cfg.providers.camera });
    const years = await imagery.availableYears();
    const layer = await imagery.getLayer(years[years.length - 1] ?? new Date().getFullYear());
    return {
      imagery: {
        provider: imagery.kind,
        availableYears: imagery.kind === 'mock' ? [] : years,
        attribution: layer?.attribution ?? null,
        note:
          imagery.kind === 'mock'
            ? 'Демо-режим: архивные снимки «До» не подключены (см. docs/IMAGERY.md). Реальные мозаики Sentinel-2/Landsat — этап 2.'
            : 'Подключён WMS-источник архивных снимков.',
      },
      camera: {
        provider: camera.kind,
        note:
          camera.kind === 'mock'
            ? 'Демо-режим: камеры — статичные кадры с псевдо-«живым» таймстемпом. Реальные HLS/RTSP — этап 2.'
            : 'Подключены реальные потоки камер.',
      },
    };
  }
}

@Module({ controllers: [ImageryController] })
export class ImageryModule {}
