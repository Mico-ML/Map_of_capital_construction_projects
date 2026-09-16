import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  AccessibilityReport,
  CoverageResult,
  IsochroneBatchResult,
  IsochroneResult,
  IsochroneStatus,
} from '@oks/shared';
import { IsochroneService } from './isochrone.service';
import { AccessibilityQueryDto, BatchIsochroneDto, CoverageQueryDto, IsochroneQueryDto } from './dto/isochrone.dto';

/**
 * Маршруты Ф4 (§11): зоны пешей доступности объекта, отчёт доступности,
 * статус интеграций, пакетный режим и сводное покрытие с «белыми пятнами».
 * Все вызовы 2ГИС идут только через этот контроллер и сервис (§4.5, §15.4);
 * тяжёлые маршруты — под rate limit по IP.
 */
@ApiTags('Изохроны и доступность (Ф4)')
@Controller()
@UseGuards(ThrottlerGuard)
export class IsochroneController {
  constructor(private readonly isochrone: IsochroneService) {}

  @Get('objects/:id/isochrone')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Зона пешей доступности объекта (кэш PostGIS → Isochrone API 2ГИС)',
    description: 'duration=600,900 (до 5 значений ≤ 3600 с), reverse=true — «к объекту», transport=walking.',
  })
  zones(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: IsochroneQueryDto,
  ): Promise<IsochroneResult> {
    return this.isochrone.zonesFor(id, {
      durations: dto.durations,
      reverse: dto.isReverse,
      transport: dto.mode,
      allowApproximate: dto.approximateAllowed,
    });
  }

  @Get('objects/:id/accessibility-report')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Отчёт доступности: население, POI, объекты той же сферы, вердикт с методикой',
  })
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: AccessibilityQueryDto,
  ): Promise<AccessibilityReport> {
    return this.isochrone.report(id, {
      durations: dto.durations,
      reverse: dto.isReverse,
      transport: dto.mode,
      allowApproximate: dto.approximateAllowed,
      allSpheres: dto.spheresRequested,
      refreshPoi: dto.poiRefresh,
    });
  }

  @Get('isochrone/status')
  @ApiOperation({ summary: 'Режим провайдеров Ф4, пресеты времени, размер кэша, метрики квот' })
  status(): Promise<IsochroneStatus> {
    return this.isochrone.status();
  }

  @Get('isochrone/coverage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Сводное покрытие территории и «белые пятна» по МО (пакетный режим, только из кэша)',
  })
  coverage(@Query() dto: CoverageQueryDto): Promise<CoverageResult> {
    return this.isochrone.coverage(dto);
  }

  @Post('isochrone/batch')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Пакетное построение изохрон для выборки объектов (отрасль/МО/сфера)',
    description:
      'Строит зоны для объектов выборки с кэшированием в PostGIS. Лимит — ISOCHRONE_BATCH_MAX_OBJECTS; ' +
      'объекты без точной геометрии исключаются, если не задано allowApproximate=true (§6.3 п.7).',
  })
  batch(@Body() dto: BatchIsochroneDto): Promise<IsochroneBatchResult> {
    return this.isochrone.batch(dto);
  }
}
