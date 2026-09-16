import { test, expect } from '@playwright/test';

/**
 * Ключевой сценарий §13 (итерация 2): «найти объект по фильтрам → открыть карточку →
 * скачать PDF-паспорт». Проверяет также deep linking фильтров и карточки.
 * Запускается против поднятого стека (docker compose up --build).
 */

test('сценарий: фильтр → карточка → PDF-паспорт', async ({ page }) => {
  // 1. Карта с фильтром «завершённые» через deep link
  await page.goto('/map?statusGroup=completed');
  await expect(page.getByText(/Показано\s+\d+\s+из/i)).toBeVisible({ timeout: 15_000 });

  // фильтр применён: кнопка «Завершено» активна
  const completedToggle = page.getByRole('button', { name: /Завершено/i }).first();
  await expect(completedToggle).toBeVisible();

  // 2. Открыть карточку первого объекта из списка
  const firstItem = page.locator('.MuiListItemButton-root').first();
  await expect(firstItem).toBeVisible({ timeout: 15_000 });
  const objectName = (await firstItem.innerText()).split('\n')[0]?.trim() ?? '';
  await firstItem.click();

  // правая панель карточки открылась (вкладки Ф2)
  await expect(page.getByRole('tab', { name: 'Сводка' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Прозрачность' })).toBeVisible();

  // 3. Перейти к PDF-паспорту
  const passportBtn = page.getByRole('link', { name: /Паспорт \(PDF\)/i });
  await expect(passportBtn).toBeVisible();
  const [passportPage] = await Promise.all([
    page.waitForEvent('popup').catch(() => null),
    passportBtn.click(),
  ]);
  const target = passportPage ?? page;
  await target.waitForLoadState('domcontentloaded');

  // 4. Паспорт содержит наименование, QR и кнопку печати
  await expect(target.getByRole('heading', { name: /Паспорт объекта/i })).toBeVisible();
  await expect(target.getByRole('button', { name: /Печать \/ Сохранить PDF/i })).toBeVisible();
  await expect(target.locator('img[alt="QR-код на страницу объекта"]')).toHaveAttribute('src', /^data:image\/png;base64,/);
  if (objectName) {
    await expect(target.getByText(objectName, { exact: false }).first()).toBeVisible();
  }
});

test('deep link карточки объекта открывает полную страницу', async ({ page }) => {
  // берём id первого объекта из API и открываем его страницу напрямую
  const res = await page.request.get('/api/v1/objects?limit=1');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const id = body.items?.[0]?.id as string | undefined;
  test.skip(!id, 'нет объектов в БД (нужен сид)');
  await page.goto(`/objects/${id}`);
  await expect(page.getByRole('tab', { name: 'Сводка' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Таймлайн' })).toBeVisible();
});

test('экспорт выборки CSV отдаёт файл', async ({ page }) => {
  const res = await page.request.get('/api/v1/export?format=csv&statusGroup=completed');
  expect(res.ok()).toBeTruthy();
  const ct = res.headers()['content-type'] ?? '';
  expect(ct).toContain('text/csv');
  const text = await res.text();
  expect(text).toContain('Наименование ОКС');
});
