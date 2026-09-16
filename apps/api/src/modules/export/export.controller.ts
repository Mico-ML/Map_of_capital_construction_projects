import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ObjectsService } from '../objects/objects.service';
import { ExportService } from './export.service';
import { ExportDto } from './dto/export.dto';

const stamp = (): string => new Date().toISOString().slice(0, 10);

@ApiTags('Экспорт')
@Controller('export')
export class ExportController {
  constructor(
    private readonly objects: ObjectsService,
    private readonly exporter: ExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Экспорт текущей выборки: format=csv|xlsx|geojson (те же фильтры, что /objects)' })
  async export(@Query() dto: ExportDto, @Res() res: Response): Promise<void> {
    const format = (dto.format ?? 'csv').toLowerCase();
    const rows = await this.objects.findForExport(dto);

    if (format === 'csv') {
      this.send(res, 'text/csv; charset=utf-8', `oks-tula-${stamp()}.csv`, this.exporter.toCsv(rows));
      return;
    }
    if (format === 'geojson') {
      this.send(
        res,
        'application/geo+json; charset=utf-8',
        `oks-tula-${stamp()}.geojson`,
        Buffer.from(this.exporter.toGeoJson(rows), 'utf-8'),
      );
      return;
    }
    if (format === 'xlsx') {
      const buf = await this.exporter.toXlsx(rows);
      this.send(
        res,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `oks-tula-${stamp()}.xlsx`,
        buf,
      );
      return;
    }
    throw new BadRequestException(`Неподдерживаемый формат экспорта: ${format} (доступны csv, xlsx, geojson)`);
  }

  private send(res: Response, contentType: string, filename: string, body: Buffer): void {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }
}
