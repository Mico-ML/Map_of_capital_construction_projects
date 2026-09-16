import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { VersioningType, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { loadConfig } from './config/env';
import { requestLogger } from './common/logger';

/** Корень репозитория: main.js в apps/api/dist (или src при dev) → ../../.. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger('Bootstrap');

  // Безопасность (§9): helmet, CORS-whitelist, структурные логи без ПДн/секретов
  app.use(
    helmet({
      contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: false,
  });
  app.use(requestLogger(config.logLevel));

  // Медиафайлы — вне webroot, раздаются отдельным префиксом
  mkdirSync(config.mediaDir, { recursive: true });
  app.useStaticAssets(config.mediaDir, { prefix: '/media/', fallthrough: true });
  // Демонстрационные медиа «До/В процессе/После» (Приложение C.3) — read-only из репозитория
  const mockMediaDir = resolve(REPO_ROOT, 'data/mock/media');
  if (existsSync(mockMediaDir)) {
    app.useStaticAssets(mockMediaDir, {
      prefix: '/mock-media/',
      fallthrough: true,
      setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=86400'),
    });
  }

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // OpenAPI 3.1 в /api/docs (§2, §11)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Портал ОКС Тульской области — REST API')
    .setDescription(
      'Публичный API интерактивного портала объектов капитального строительства ' +
        'Тульской области. Версия `/api/v1`. Все запросы к 2ГИС (кроме MapGL в браузере) ' +
        'проксируются через бэкенд с кэшем и rate limiting.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, '0.0.0.0');
  logger.log(`API запущен на порту ${config.apiPort}; Swagger: /api/docs; health: /api/health`);
  logger.log(`Провайдеры в демо-режиме: ${describeProviders(config)}`);
}

function describeProviders(config: ReturnType<typeof loadConfig>): string {
  return Object.entries(config.providers)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Не удалось запустить API', err);
  process.exit(1);
});
