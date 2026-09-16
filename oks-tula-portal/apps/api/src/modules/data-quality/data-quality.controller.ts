import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { loadConfig } from '../../config/env';

/**
 * Отчёт ETL о качестве данных (§5, §6.1). Читает артефакт reports/data_quality.json,
 * сгенерированный `npm run etl:dry` (в контейнере — при старте api).
 */
@ApiTags('Качество данных')
@Controller('data-quality')
export class DataQualityController {
  @Get()
  @ApiOperation({ summary: 'Отчёт о качестве данных реестра (JSON)' })
  report(@Res() res: Response): void {
    const cfg = loadConfig(process.env);
    const jsonPath = resolve(process.cwd(), cfg.reportsDir, 'data_quality.json');
    if (!existsSync(jsonPath)) {
      throw new NotFoundException(
        'Отчёт не сформирован. Выполните `npm run etl:dry` (или перезапустите контейнер api).',
      );
    }
    const body = readFileSync(jsonPath, 'utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(body);
  }
}
