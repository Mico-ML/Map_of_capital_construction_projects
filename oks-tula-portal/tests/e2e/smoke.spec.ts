import { test, expect } from '@playwright/test';

/**
 * Дымовой сценарий итераций 0–1: портал поднимается, главная показывает ключевые цифры,
 * карта/список объектов загружаются, карточка объекта открывается.
 *
 * Полные 5 ключевых сценариев §13 подключаются по мере готовности фич (docs/ROADMAP.md):
 *  1) фильтр → карточка → скачать PDF (итерация 2);
 *  2) «До/После» + таймлапс (итерация 3);
 *  3) изохрона 10/15 мин + кэш (итерация 4);
 *  4) «светофор» по сфере + drill-down (итерация 5);
 *  5) подача жалобы → номер → отслеживание → модерация (итерация 6).
 */

test('главная страница загружается и показывает цифры реестра', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Интерактивный портал/i })).toBeVisible();
  // ключевая цифра «объектов в реестре» должна появиться после загрузки /analytics/summary
  await expect(page.getByText(/объектов в реестре/i)).toBeVisible({ timeout: 15_000 });
});

test('страница карты показывает список объектов и счётчик', async ({ page }) => {
  await page.goto('/map');
  // счётчик «Показано N из M»
  await expect(page.getByText(/Показано\s+\d+\s+из/i)).toBeVisible({ timeout: 15_000 });
});

test('healthcheck API отвечает ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status === 'ok' || body.status === 'degraded').toBeTruthy();
});
