import { Injectable, OnModuleInit } from '@nestjs/common';
import { caching, type Cache } from 'cache-manager';
import { loadConfig } from '../config/env';

/**
 * In-memory кэш (MVP). Интерфейс допускает замену на Redis на этапе 2 (§3, §10):
 * достаточно подменить фабрику `caching('memory', …)` на `caching('redis', …)`.
 * Кэширует ответы геокодера и (в итерации 4) изохроны — экономия квот 2ГИС.
 */
@Injectable()
export class CacheService implements OnModuleInit {
  private cache!: Cache;
  private readonly maxEntries: number;

  constructor() {
    this.maxEntries = loadConfig(process.env).cache.maxEntries;
  }

  async onModuleInit(): Promise<void> {
    this.cache = await caching('memory', { max: this.maxEntries, ttl: 60_000 });
  }

  /** TTL в секундах → миллисекунды. */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.cache.set(key, value, ttlSeconds * 1000);
  }

  /** Получить-или-вычислить с кэшированием. */
  async wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
