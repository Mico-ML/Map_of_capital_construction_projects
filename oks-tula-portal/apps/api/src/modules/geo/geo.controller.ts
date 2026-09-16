import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { GeoService } from './geo.service';

class RubricQueryDto {
  @IsString()
  @MaxLength(200)
  q!: string;
}

class GeocodeQueryDto {
  @IsString()
  @MaxLength(300)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

/**
 * Прокси 2ГИС (§4.5): геокодер и рубрикатор с кэшем и rate limiting.
 * Ключи 2ГИС не покидают бэкенд; из браузера сюда ходит только фронт.
 * Зоны доступности — в модуле `isochrone` (§11): /objects/{id}/isochrone и /isochrone/*.
 */
@ApiTags('Гео-прокси 2ГИС')
@Controller('geo')
@UseGuards(ThrottlerGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('geocode')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Геокодинг адреса через бэкенд-прокси 2ГИС (кэш 90 суток)' })
  geocode(@Query() dto: GeocodeQueryDto) {
    return this.geo.geocode(dto.q, dto.limit ?? 10);
  }

  @Get('rubrics')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Рубрикатор 2ГИС (Categories API) — для верификации config/poi_rubrics.ts',
    description:
      'Возвращает id/alias/name рубрик региона. Используется для заполнения конфига рубрик ' +
      'перед боевым подключением Search API (§4.4). В демо-режиме — честная помета без данных.',
  })
  rubrics(@Query() dto: RubricQueryDto) {
    return this.geo.rubrics(dto.q);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Режимы интеграций и метрики расхода квот' })
  providers() {
    return this.geo.providersStatus();
  }
}
