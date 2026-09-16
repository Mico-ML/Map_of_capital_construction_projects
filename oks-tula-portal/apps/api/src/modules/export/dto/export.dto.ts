import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListObjectsDto } from '../../objects/dto/list-objects.dto';

/** Фильтры как у /objects + формат выгрузки (csv|xlsx|geojson). */
export class ExportDto extends ListObjectsDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx', 'geojson'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'xlsx', 'geojson'])
  format?: 'csv' | 'xlsx' | 'geojson';
}
