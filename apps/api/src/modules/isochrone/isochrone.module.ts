import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadConfig } from '../../config/env';
import { IsochroneController } from './isochrone.controller';
import { IsochroneService } from './isochrone.service';

const cfg = loadConfig(process.env);

/**
 * Модуль Ф4 (зоны пешей доступности). Rate limit — как у гео-прокси (§4.5):
 * изохроны не чаще RATE_LIMIT_GEO_PER_MIN на IP, пакетный режим — жёстче
 * (декоратор @Throttle на маршруте).
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: cfg.rateLimit.geoPerMin }])],
  controllers: [IsochroneController],
  providers: [IsochroneService],
  exports: [IsochroneService],
})
export class IsochroneModule {}
