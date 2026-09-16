import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { loadConfig } from '../../config/env';

const cfg = loadConfig(process.env);

@Module({
  imports: [
    // Rate limit на гео-прокси (§4.5): по IP, геокодинг не чаще N раз в минуту
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: cfg.rateLimit.geoPerMin }]),
  ],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
