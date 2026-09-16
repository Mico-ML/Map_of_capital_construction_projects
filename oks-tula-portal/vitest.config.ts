import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Единая конфигурация unit-тестов монорепозитория.
// Алиасы указывают на ИСХОДНИКИ пакетов — тесты не требуют предварительной сборки.
export default defineConfig({
  resolve: {
    alias: {
      '@oks/shared': r('./packages/shared/src/index.ts'),
      '@oks/etl': r('./etl/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/shared/tests/**/*.test.ts',
      'etl/tests/**/*.test.ts',
      'apps/api/test/**/*.test.ts',
    ],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**', 'etl/src/**'],
      reporter: ['text', 'html'],
    },
  },
});
