import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-конфигурация (§3: Playwright). Запускается против поднятого стека:
 *   docker compose up --build   →   npm --prefix tests/e2e run test
 * baseURL — веб-портал (nginx) на WEB_PORT (по умолчанию 8080).
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
    locale: 'ru-RU',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
