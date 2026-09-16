import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Сценарий §13 (итерация 3): «До/В процессе/После» + таймлапс + камеры-заглушки
 * с обновляемым таймстемпом. Требует засеянной БД (демо-медиа на 10 объектах).
 */

async function findObjectWithMedia(request: APIRequestContext): Promise<string | null> {
  const res = await request.get('/api/v1/objects?hasMedia=true&limit=1');
  if (!res.ok()) return null;
  const body = await res.json();
  return body.items?.[0]?.id ?? null;
}

test('карточка: таймлапс «До/В процессе/После» и режимы сравнения', async ({ page, request }) => {
  const id = await findObjectWithMedia(request);
  test.skip(!id, 'нет объектов с медиа (нужен сид + generate_mock_media.py)');

  await page.goto(`/objects/${id}`);
  await page.getByRole('tab', { name: 'Фото и медиа' }).click();

  // Хронология: кадры, слайдер, миниатюры, демо-бейдж
  await expect(page.getByRole('button', { name: 'Хронология' })).toBeVisible();
  await expect(page.getByRole('img').first()).toBeVisible();
  await expect(page.getByText(/ДЕМО-ДАННЫЕ|демо-материалы/i).first()).toBeVisible();

  // Переключение в режим сравнения «До / После»
  await page.getByRole('button', { name: 'До / После' }).click();
  await expect(page.getByRole('button', { name: 'Шторка' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Бок о бок' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Наложение' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Было/стало' })).toBeVisible();

  // «Было/стало» переключает кадр
  await page.getByRole('button', { name: 'Было/стало' }).click();
  await expect(page.getByRole('button', { name: /Показать «После»|Показать «До»/ })).toBeVisible();
});

test('камера-заглушка показывает и обновляет метку времени кадра', async ({ page, request }) => {
  // ищем активный объект с камерой (демо-камеры засеяны на активных с координатами)
  const listRes = await request.get('/api/v1/objects?limit=100');
  const body = await listRes.json();
  const withCamera = (body.items ?? []).find((o: { hasCamera?: boolean }) => o.hasCamera);
  test.skip(!withCamera, 'нет объектов с камерами в демо-наборе');

  await page.goto(`/objects/${withCamera.id}`);
  await page.getByRole('tab', { name: 'Фото и медиа' }).click();
  await page.getByRole('button', { name: 'Камеры' }).click();

  const stamp = page.getByText(/Кадр:/).first();
  await expect(stamp).toBeVisible();
  const first = (await stamp.textContent()) ?? '';
  // таймстемп «живой»: через ~31с (refreshSec=30) должен обновиться
  await page.waitForTimeout(31_500);
  const second = (await stamp.textContent()) ?? '';
  expect(second).not.toBe(first);
});
