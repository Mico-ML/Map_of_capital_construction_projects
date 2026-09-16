import { Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from './common/prisma.service';
import { CacheModule } from './common/cache.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppConfig, loadConfig } from './config/env';
import { HealthController } from './modules/health/health.controller';
import { ObjectsModule } from './modules/objects/objects.module';
import { DictionariesModule } from './modules/dictionaries/dictionaries.module';
import { MunicipalitiesModule } from './modules/municipalities/municipalities.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DataQualityModule } from './modules/data-quality/data-quality.module';
import { GeoModule } from './modules/geo/geo.module';
import { IsochroneModule } from './modules/isochrone/isochrone.module';
import { ExportModule } from './modules/export/export.module';
import { ImageryModule } from './modules/imagery/imagery.controller';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ app: loadConfig(process.env) as AppConfig })],
    }),
    CacheModule,
    ObjectsModule,
    DictionariesModule,
    MunicipalitiesModule,
    AnalyticsModule,
    DataQualityModule,
    GeoModule,
    IsochroneModule,
    ExportModule,
    ImageryModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    ConfigService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        enableDebugMessages: false,
      }),
    },
  ],
  exports: [PrismaService, ConfigService],
})
export class AppModule {}
