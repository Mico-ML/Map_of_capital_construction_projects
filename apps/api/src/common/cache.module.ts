import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/** Глобальный кэш-сервис (in-memory на MVP; интерфейс готов к Redis — §3, §10). */
@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
