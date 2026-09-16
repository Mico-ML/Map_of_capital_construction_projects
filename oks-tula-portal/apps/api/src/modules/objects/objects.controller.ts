import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ObjectDetails, ObjectSummary, Paginated } from '@oks/shared';
import { ObjectsService } from './objects.service';
import { ListObjectsDto } from './dto/list-objects.dto';

@ApiTags('Объекты')
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objects: ObjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Список объектов с фильтрами и пагинацией (Ф1)' })
  list(@Query() dto: ListObjectsDto): Promise<Paginated<ObjectSummary>> {
    return this.objects.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Полная карточка объекта (Ф2)' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ObjectDetails> {
    return this.objects.getById(id);
  }

  @Get(':id/geojson')
  @ApiOperation({ summary: 'GeoJSON Feature объекта' })
  getGeoJson(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.objects.getGeoJson(id);
  }

  @Get(':id/contracts')
  @ApiOperation({ summary: 'Закупки/контракты объекта (Ф6; на MVP — демо-данные)' })
  contracts(@Param('id', ParseUUIDPipe) id: string) {
    return this.objects.contracts(id);
  }

  @Get(':id/media')
  @ApiOperation({ summary: 'Медиа «До/В процессе/После» (Ф3)' })
  media(@Param('id', ParseUUIDPipe) id: string) {
    return this.objects.media(id);
  }

  @Get(':id/cameras')
  @ApiOperation({ summary: 'Камеры стройплощадки (Ф3)' })
  cameras(@Param('id', ParseUUIDPipe) id: string) {
    return this.objects.cameras(id);
  }

  @Get(':id/appeals')
  @ApiOperation({ summary: 'Обезличенные обращения по объекту (Ф8)' })
  appeals(@Param('id', ParseUUIDPipe) id: string) {
    return this.objects.appeals(id);
  }
}
