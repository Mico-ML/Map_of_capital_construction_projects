import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AnalyticsSummary, RiskObject } from '@oks/shared';
import { AnalyticsService } from './analytics.service';

@ApiTags('Аналитика')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Сводка для главной и дашборда (Ф9)' })
  summary(): Promise<AnalyticsSummary> {
    return this.analytics.summary();
  }

  @Get('risks')
  @ApiOperation({ summary: 'Объекты риска: истёк срок контракта при готовности < 100 (Ф9)' })
  risks(): Promise<RiskObject[]> {
    return this.analytics.risks();
  }
}
