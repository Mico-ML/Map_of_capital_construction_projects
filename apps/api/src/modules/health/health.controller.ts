import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { loadConfig, mockProviders } from '../../config/env';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  version: string;
  database: 'up' | 'down';
  mapglKeyPresent: boolean;
  mockProviders: string[];
  timestamp: string;
}

@ApiTags('Служебное')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Healthcheck (/api/health): состояние API, БД и режимов интеграций' })
  async check(): Promise<HealthResponse> {
    const cfg = loadConfig(process.env);
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
      database: dbUp ? 'up' : 'down',
      mapglKeyPresent: cfg.mapglKeyPresent,
      mockProviders: mockProviders(cfg),
      timestamp: new Date().toISOString(),
    };
  }
}
