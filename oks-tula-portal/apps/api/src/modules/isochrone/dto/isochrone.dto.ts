import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { toList } from '../../../common/query';
import {
  DEFAULT_DURATIONS_SEC,
  DEFAULT_TRANSPORT,
  ISOCHRONE_TRANSPORTS,
  MAX_DURATION_SEC,
  MAX_DURATIONS_PER_REQUEST,
  MIN_DURATION_SEC,
  POI_SPHERES,
} from '@oks/shared';
import type { SphereCode, StatusGroupCode } from '@oks/shared';

/**
 * DTO модуля изохрон (§7 Ф4, §11).
 * Параметры принимаются и списком (`duration=600&duration=900`), и через запятую
 * (`duration=600,900` — формат из §11 ТЗ), поэтому нормализуются `@Transform`.
 */

const STATUS_GROUPS: StatusGroupCode[] = ['design', 'construction', 'procurement', 'completed'];

/** «600,900» | ['600','900'] → [600, 900] (с отсевом мусора). */
export function parseDurations(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const parsed = raw
    .map((v) => Number.parseInt(String(v).trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= MIN_DURATION_SEC && n <= MAX_DURATION_SEC);
  // §4.2: до 5 промежутков времени, каждый ≤ 3600 с
  return [...new Set(parsed)].slice(0, MAX_DURATIONS_PER_REQUEST);
}

// Нормализация списков (`toList`) — общая для всех DTO, см. `common/query.ts`.
export { toList };

/** Одно значение длительности: «900» → 900. */
export function parseSingleDuration(value: unknown, fallback: number): number {
  const list = parseDurations(value);
  const first = list[0];
  if (first === undefined) return fallback;
  return first;
}

function transformDurations({ value }: { value: unknown }): number[] {
  const parsed = value === undefined || value === '' ? DEFAULT_DURATIONS_SEC : parseDurations(value);
  if (parsed.length === 0) {
    throw new BadRequestException(
      `Некорректный параметр duration: нужно 1–${MAX_DURATIONS_PER_REQUEST} значений ` +
        `${MIN_DURATION_SEC}–${MAX_DURATION_SEC} с`,
    );
  }
  return parsed;
}

/** Общие параметры запроса зон доступности. */
export class IsochroneQueryDto {
  @ApiPropertyOptional({
    description: 'Промежутки времени, с (до 5, каждый ≤ 3600). По умолчанию 600,900 (10 и 15 минут)',
    example: '600,900',
  })
  @IsOptional()
  @Transform(transformDurations)
  @IsArray()
  @ArrayMaxSize(MAX_DURATIONS_PER_REQUEST)
  @IsInt({ each: true })
  @Min(MIN_DURATION_SEC, { each: true })
  @Max(MAX_DURATION_SEC, { each: true })
  duration?: number[];

  @ApiPropertyOptional({ description: 'true — «к объекту» (reverse), false — «от объекта»', default: 'false' })
  @IsOptional()
  @IsBooleanString()
  reverse?: string;

  @ApiPropertyOptional({ description: 'Способ передвижения (Ф4 — пешком)', enum: ISOCHRONE_TRANSPORTS })
  @IsOptional()
  @IsIn(ISOCHRONE_TRANSPORTS)
  transport?: (typeof ISOCHRONE_TRANSPORTS)[number];

  @ApiPropertyOptional({
    description:
      'true — разрешить расчёт от приближённой точки (центроид МО) для объектов без геометрии. ' +
      'Явное согласие пользователя (§6.3 п.7); по умолчанию такие объекты исключаются.',
    default: 'false',
  })
  @IsOptional()
  @IsBooleanString()
  allowApproximate?: string;

  get durations(): number[] {
    return this.duration && this.duration.length > 0 ? this.duration : [...DEFAULT_DURATIONS_SEC];
  }

  get isReverse(): boolean {
    return this.reverse === 'true';
  }

  get mode(): (typeof ISOCHRONE_TRANSPORTS)[number] {
    return this.transport ?? DEFAULT_TRANSPORT;
  }

  get approximateAllowed(): boolean {
    return this.allowApproximate === 'true';
  }
}

/** Параметры отчёта доступности (одна зона + опционально все сферы POI). */
export class AccessibilityQueryDto extends IsochroneQueryDto {
  @ApiPropertyOptional({ description: 'Считать POI по всем 5 сферам, а не только по сфере объекта', default: 'false' })
  @IsOptional()
  @IsBooleanString()
  allSpheres?: string;

  @ApiPropertyOptional({ description: 'Пропустить кэш POI и запросить Search API заново', default: 'false' })
  @IsOptional()
  @IsBooleanString()
  refreshPoi?: string;

  get spheresRequested(): boolean {
    return this.allSpheres === 'true';
  }

  get poiRefresh(): boolean {
    return this.refreshPoi === 'true';
  }
}

/** Фильтры сводного покрытия и «белых пятен» (пакетный режим Ф4). */
export class CoverageQueryDto {
  @ApiPropertyOptional({ description: 'Сфера (образование/здравоохранение/спорт/культура/энергетика)', enum: POI_SPHERES })
  @IsOptional()
  @IsIn(POI_SPHERES)
  sphere?: SphereCode;

  @ApiPropertyOptional({ description: 'Коды отраслей (альтернатива сфере)', isArray: true })
  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsString({ each: true })
  industry?: string[];

  @ApiPropertyOptional({ description: 'id МО (пусто — вся область)', isArray: true })
  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsString({ each: true })
  municipality?: string[];

  @ApiPropertyOptional({ description: 'Группы статусов', enum: STATUS_GROUPS, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsIn(STATUS_GROUPS, { each: true })
  statusGroup?: StatusGroupCode[];

  @ApiPropertyOptional({ description: 'Промежуток времени, с (один)', example: '900' })
  @IsOptional()
  @Transform(({ value }) => parseSingleDuration(value, DEFAULT_DURATIONS_SEC[DEFAULT_DURATIONS_SEC.length - 1]))
  @IsInt()
  @Min(MIN_DURATION_SEC)
  @Max(MAX_DURATION_SEC)
  duration?: number;

  @IsOptional()
  @IsBooleanString()
  reverse?: string;

  @IsOptional()
  @IsBooleanString()
  allowApproximate?: string;

  get durationSec(): number {
    return this.duration ?? DEFAULT_DURATIONS_SEC[DEFAULT_DURATIONS_SEC.length - 1];
  }

  get isReverse(): boolean {
    return this.reverse === 'true';
  }

  get approximateAllowed(): boolean {
    return this.allowApproximate === 'true';
  }
}

/** Тело POST /isochrone/batch — пакетное построение зон для аналитиков (§7 Ф4). */
export class BatchIsochroneDto extends CoverageQueryDto {
  @ApiPropertyOptional({ description: 'Промежутки времени, с (1–5)', example: '600,900' })
  @IsOptional()
  @Transform(transformDurations)
  @IsArray()
  @ArrayMaxSize(MAX_DURATIONS_PER_REQUEST)
  @IsInt({ each: true })
  @Min(MIN_DURATION_SEC, { each: true })
  @Max(MAX_DURATION_SEC, { each: true })
  durations?: number[];

  @ApiPropertyOptional({ description: 'Перестроить зоны, даже если они есть в кэше', default: 'false' })
  @IsOptional()
  @IsBooleanString()
  force?: string;

  get durationList(): number[] {
    return this.durations && this.durations.length > 0
      ? this.durations
      : [...DEFAULT_DURATIONS_SEC];
  }

  get forceRebuild(): boolean {
    return this.force === 'true';
  }
}
