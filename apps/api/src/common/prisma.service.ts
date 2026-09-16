import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Обёртка PrismaClient как NestJS-провайдер.
 * Единая точка подключения к PostgreSQL/PostGIS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к БД установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Проверка живости БД для healthcheck. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
