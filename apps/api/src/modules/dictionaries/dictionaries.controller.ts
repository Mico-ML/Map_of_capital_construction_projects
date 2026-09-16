import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import {
  APPEAL_CATEGORIES,
  CAPACITY_UNITS,
  INDUSTRIES,
  MUNICIPALITIES,
  STATUSES,
  type DictionaryKind,
} from '@oks/shared';
import { PrismaService } from '../../common/prisma.service';

const KINDS: DictionaryKind[] = [
  'industry',
  'status',
  'municipality',
  'appeal-category',
  'program',
  'organization',
  'capacity-unit',
];

@ApiTags('Справочники')
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Список доступных справочников' })
  kinds(): { kinds: DictionaryKind[] } {
    return { kinds: KINDS };
  }

  @Get(':kind')
  @ApiOperation({ summary: 'Элементы справочника (с ETag/Cache-Control, §11)' })
  async get(@Param('kind') kind: string, @Res() res: Response): Promise<void> {
    if (!KINDS.includes(kind as DictionaryKind)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Неизвестный справочник: ${kind}` } });
      return;
    }
    const items = await this.load(kind as DictionaryKind);
    const body = JSON.stringify({ items });
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('ETag', etag);
    if (res.req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(body);
  }

  private async load(kind: DictionaryKind): Promise<unknown[]> {
    switch (kind) {
      case 'industry':
        return INDUSTRIES.map((i) => ({ id: i.code, name: i.name, sphere: i.sphere, sortOrder: i.sortOrder }));
      case 'status':
        return STATUSES.map((s) => ({ id: s.code, name: s.name, group: s.group, colorHex: s.colorHex }));
      case 'municipality':
        // статический эталон (центры/площади) + население из БД, если засеяно
        return MUNICIPALITIES.map((m) => ({
          id: m.id,
          name: m.nameShort,
          nameFull: m.nameFull,
          oktmo: m.oktmo,
          type: m.type,
          center: m.center,
          areaKm2: m.areaKm2,
        }));
      case 'appeal-category':
        return APPEAL_CATEGORIES.map((c) => ({ id: c.code, name: c.title, description: c.description, slaDays: c.slaDays }));
      case 'capacity-unit':
        return CAPACITY_UNITS.map((u) => ({ id: u.code, name: u.name }));
      case 'program':
        return this.prisma.program.findMany({ orderBy: [{ level: 'asc' }, { nameNormalized: 'asc' }] });
      case 'organization':
        return this.prisma.organization.findMany({
          orderBy: [{ type: 'asc' }, { nameNormalized: 'asc' }],
          select: { id: true, type: true, nameNormalized: true, inn: true },
        });
      default:
        return [];
    }
  }
}
