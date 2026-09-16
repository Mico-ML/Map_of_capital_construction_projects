import { IsOptional, IsString, IsInt, Min, Max, IsBooleanString, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { StatusGroupCode } from '@oks/shared';
import { toList } from '../../../common/query';

/**
 * Списковые фильтры принимаются и повтором параметра, и через запятую
 * (deep links портала), и одним значением — всё приводится к массиву,
 * иначе Prisma получает строку вместо `{ in: [...] }`.
 */
const asList = (): PropertyDecorator => Transform(({ value }) => toList(value));

const STATUS_GROUPS: StatusGroupCode[] = ['design', 'construction', 'procurement', 'completed'];

/**
 * Query-параметры GET /api/v1/objects (§11).
 * Мультизначные фильтры передаются повтором параметра или через запятую.
 */
export class ListObjectsDto {
  @ApiPropertyOptional({ description: 'Коды отраслей', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  industry?: string[];

  @ApiPropertyOptional({ description: 'Коды статусов', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  status?: string[];

  @ApiPropertyOptional({ description: 'Группы статусов', enum: STATUS_GROUPS, isArray: true })
  @IsOptional()
  @asList()
  @IsIn(STATUS_GROUPS, { each: true })
  statusGroup?: StatusGroupCode[];

  @ApiPropertyOptional({ description: 'id муниципальных образований', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  municipality?: string[];

  @ApiPropertyOptional({ description: 'Форма собственности', isArray: true })
  @IsOptional()
  @asList()
  @IsIn(['state', 'municipal', 'unknown'], { each: true })
  ownership?: ('state' | 'municipal' | 'unknown')[];

  @ApiPropertyOptional({ description: 'Поиск по названию/адресу/подрядчику' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Год ввода/окончания: нижняя граница' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearFrom?: number;

  @ApiPropertyOptional({ description: 'Год ввода/окончания: верхняя граница' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearTo?: number;

  @ApiPropertyOptional({ description: 'Минимальная строительная готовность, %' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  readinessMin?: number;

  @ApiPropertyOptional({ description: 'Только объекты с точной геометрией' })
  @IsOptional()
  @IsBooleanString()
  hasGeometry?: string;

  @ApiPropertyOptional({ description: 'Заказчики (нормализованные наименования)', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  customer?: string[];

  @ApiPropertyOptional({ description: 'Подрядчики (нормализованные наименования)', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  contractor?: string[];

  @ApiPropertyOptional({ description: 'ГРБС (нормализованные наименования)', isArray: true })
  @IsOptional()
  @asList()
  @IsString({ each: true })
  grbs?: string[];

  @ApiPropertyOptional({ description: 'Только объекты с медиа (фото/рендеры)' })
  @IsOptional()
  @IsBooleanString()
  hasMedia?: string;

  @ApiPropertyOptional({ description: 'Только объекты с камерами' })
  @IsOptional()
  @IsBooleanString()
  hasCamera?: string;

  @ApiPropertyOptional({ description: 'Ограничивающий прямоугольник: minLon,minLat,maxLon,maxLat' })
  @IsOptional()
  @IsString()
  bbox?: string;

  @ApiPropertyOptional({ description: '«Рядом со мной»: lon,lat,radiusMeters (геолокация с согласия пользователя)' })
  @IsOptional()
  @IsString()
  near?: string;

  @ApiPropertyOptional({ description: 'Сортировка', enum: ['name', 'commissioningYear', 'readiness', 'yearEnd'] })
  @IsOptional()
  @IsIn(['name', 'commissioningYear', 'readiness', 'yearEnd'])
  sort?: 'name' | 'commissioningYear' | 'readiness' | 'yearEnd';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
