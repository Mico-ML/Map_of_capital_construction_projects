import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Сценарии §13 «Изохроны» (итерация 4):
 *  - 10 и 15 минут строятся для объекта с геометрией, поддерживаются 5/10/15/20 мин;
 *  - reverse переключается;
 *  - результат кэшируется: повторный запрос НЕ вызывает Isochrone API (видно по метрикам);
 *  - POI/население в отчёте доступности + вердикт с методикой;
 *  - пакетный режим и «белые пятна»;
 *  - объекты без геометрии не участвуют в расчёте без явного согласия (§6.3 п.7).
 *
 * Тесты проходят и в демо-режиме (ISOCHRONE_PROVIDER=mock): зоны помечаются
 * isMock=true, и проверки учитывают оба режима.
 */

async function findObjectWithGeometry(request: APIRequestContext): Promise<string | null> {
  const res = await request.get('/api/v1/objects?hasGeometry=true&limit=1');
  if (!res.ok()) return null;
  const body = await res.json();
  return body.items?.[0]?.id ?? null;
}

async function findObjectWithoutGeometry(request: APIRequestContext): Promise<string | null> {
  const res = await request.get('/api/v1/objects?hasGeometry=false&limit=1');
  if (!res.ok()) return null;
  const body = await res.json();
  return body.items?.[0]?.id ?? null;
}

async function status(request: APIRequestContext) {
  const res = await request.get('/api/v1/isochrone/status');
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test('API: зоны 10 и 15 минут строятся и кэшируются без повторных вызовов API', async ({ request }) => {
  const id = await findObjectWithGeometry(request);
  test.skip(!id, 'нет объектов с точной геометрией (нужен сид реестра)');

  const url = `/api/v1/objects/${id}/isochrone?duration=600,900&reverse=false&transport=walking`;
  const before = await status(request);

  const first = await request.get(url);
  expect(first.ok()).toBeTruthy();
  const body = await first.json();
  expect(body.objectId).toBe(id);
  expect(body.transport).toBe('walking');
  expect(body.reverse).toBe(false);
  expect(body.direction).toBe('from');
  expect(body.available).toBe(true);
  expect(body.zones.map((z: { durationSec: number }) => z.durationSec)).toEqual([600, 900]);
  for (const zone of body.zones) {
    expect(zone.geometry.type).toBe('MultiPolygon');
    expect(zone.geometry.coordinates.length).toBeGreaterThan(0);
    expect(zone.areaM2).toBeGreaterThan(0);
    expect(zone.durationLabel).toMatch(/минут/);
    expect(typeof zone.isMock).toBe('boolean');
    // demo-зона обязана быть помечена, боевая — нет
    expect(zone.isMock).toBe(body.isMock);
  }
  expect(body.disclaimer.length).toBeGreaterThan(20);

  const afterFirst = await status(request);
  const second = await request.get(url);
  const body2 = await second.json();
  const afterSecond = await status(request);

  // §13: повторный клик не вызывает API — счётчик обращений не растёт, зоны из кэша/модели
  expect(afterSecond.quota.isochroneApiCalls).toBe(afterFirst.quota.isochroneApiCalls);
  expect(body2.zones.every((z: { source: string }) => z.source === 'cache' || z.source === 'model')).toBeTruthy();
  expect(afterSecond.cachedZones).toBeGreaterThanOrEqual(afterFirst.cachedZones);
  expect(afterFirst.cachedZones).toBeGreaterThanOrEqual(before.cachedZones);
});

test('API: поддерживаются 5/10/15/20 минут и переключатель reverse', async ({ request }) => {
  const id = await findObjectWithGeometry(request);
  test.skip(!id, 'нет объектов с точной геометрией');

  const all = await request.get(`/api/v1/objects/${id}/isochrone?duration=300,600,900,1200&reverse=true`);
  expect(all.ok()).toBeTruthy();
  const body = await all.json();
  expect(body.reverse).toBe(true);
  expect(body.direction).toBe('to');
  expect(body.zones.map((z: { durationSec: number }) => z.durationSec)).toEqual([300, 600, 900, 1200]);

  // §4.2: не более 5 промежутков, каждый ≤ 3600 с — лишнее отбрасывается
  const tooMany = await request.get(`/api/v1/objects/${id}/isochrone?duration=300,600,900,1200,1800,3600`);
  expect(tooMany.ok()).toBeTruthy();
  expect((await tooMany.json()).zones.length).toBeLessThanOrEqual(5);

  const invalid = await request.get(`/api/v1/objects/${id}/isochrone?duration=5000`);
  expect(invalid.status()).toBe(400);
});

test('API: объект без точной геометрии не участвует в расчёте без явного согласия (§6.3 п.7)', async ({ request }) => {
  const id = await findObjectWithoutGeometry(request);
  test.skip(!id, 'все объекты имеют геометрию — проверять нечего');

  const strict = await request.get(`/api/v1/objects/${id}/isochrone?duration=900`);
  expect(strict.ok()).toBeTruthy();
  const body = await strict.json();
  expect(body.available).toBe(false);
  expect(body.unavailableReason).toBe('no_geometry');
  expect(body.zones).toHaveLength(0);
  expect(body.note).toMatch(/6\.3|местоположени/i);

  const approximate = await request.get(`/api/v1/objects/${id}/isochrone?duration=900&allowApproximate=true`);
  const body2 = await approximate.json();
  expect(body2.locationApproximate).toBe(true);
  expect(body2.note).toMatch(/центроид|приближён/i);
});

test('API: отчёт доступности — население, POI, объекты той же сферы и вердикт с методикой', async ({ request }) => {
  const id = await findObjectWithGeometry(request);
  test.skip(!id, 'нет объектов с точной геометрией');

  const res = await request.get(`/api/v1/objects/${id}/accessibility-report?duration=900&reverse=true`);
  expect(res.ok()).toBeTruthy();
  const report = await res.json();

  expect(report.objectId).toBe(id);
  expect(report.durationSec).toBe(900);
  expect(report.direction).toBe('to');
  expect(['closes_deficit', 'duplicates', 'improves', 'insufficient_data']).toContain(report.verdict.code);
  expect(report.verdict.title.length).toBeGreaterThan(5);
  expect(report.verdict.basis.length).toBeGreaterThan(0);
  expect(report.methodology.length).toBeGreaterThanOrEqual(6);
  expect(report.disclaimer.length).toBeGreaterThan(20);

  // население: значение с методом и источником либо честное «Нет данных»
  expect(report.population).toHaveProperty('method');
  expect(report.population).toHaveProperty('source');
  if (report.population.value === null) {
    expect(report.population.gapReason).toBeTruthy();
  } else {
    expect(report.population.value).toBeGreaterThan(0);
  }

  // POI: в демо-режиме count=null и причина provider_mock; в боевом — число
  const groups = report.poi.filter((g: { sphere: string }) => g.sphere !== 'residential');
  expect(groups.length).toBeGreaterThan(0);
  for (const group of groups) {
    if (group.count === null) expect(group.gapReason).toBeTruthy();
    else expect(group.count).toBeGreaterThanOrEqual(0);
  }

  // объекты той же сферы — из реестра ОКС (реальные данные)
  for (const item of [...report.sameSphere.inside, ...report.sameSphere.nearest]) {
    expect(item.origin).toBe('registry');
    expect(item.isMock).toBe(false);
    if (item.distanceM !== null) expect(item.distanceM).toBeGreaterThanOrEqual(0);
  }
});

test('API: пакетный режим строит зоны, покрытие и «белые пятна» считаются в PostGIS', async ({ request }) => {
  const batch = await request.post('/api/v1/isochrone/batch', {
    data: { sphere: 'education', duration: 900, reverse: 'true', durations: '900' },
  });
  expect(batch.ok()).toBeTruthy();
  const batchBody = await batch.json();
  expect(batchBody.requested).toBeGreaterThanOrEqual(0);
  expect(batchBody.built + batchBody.fromCache + batchBody.failed + batchBody.skippedNoGeometry).toBe(
    batchBody.requested,
  );
  if (batchBody.requested === 0) {
    test.skip(true, 'в реестре нет объектов сферы «образование» с геометрией');
  }

  const coverage = await request.get('/api/v1/isochrone/coverage?sphere=education&duration=900&reverse=true');
  expect(coverage.ok()).toBeTruthy();
  const body = await coverage.json();
  expect(body.durationSec).toBe(900);
  expect(body.reverse).toBe(true);
  expect(Array.isArray(body.municipalities)).toBe(true);

  if (body.hasData) {
    expect(body.coverage?.type).toBe('FeatureCollection');
    expect(body.whiteSpots?.type).toBe('FeatureCollection');
    const covered = body.municipalities.filter((m: { hasData: boolean }) => m.hasData);
    expect(covered.length).toBeGreaterThan(0);
    for (const m of covered) {
      expect(m.coveredPct).toBeGreaterThanOrEqual(0);
      expect(m.coveredPct).toBeLessThanOrEqual(100);
      if (m.coveredKm2 !== null && m.areaKm2 !== null) expect(m.coveredKm2).toBeLessThanOrEqual(m.areaKm2 + 0.01);
    }
    expect(body.totals.objectsIncluded).toBeGreaterThan(0);
  } else {
    // честное «нет данных»: слои пустые, а не имитация покрытия (§15.1)
    expect(body.coverage).toBeNull();
    expect(body.whiteSpots).toBeNull();
    expect(body.note).toMatch(/нет изохрон|постройте/i);
  }
});

test('UI: вкладка «Доступность» — зона, вердикт и методика', async ({ page, request }) => {
  const id = await findObjectWithGeometry(request);
  test.skip(!id, 'нет объектов с точной геометрией');

  await page.goto(`/objects/${id}`);
  await page.getByRole('tab', { name: 'Доступность' }).click();

  // пресеты времени и направление (§7 Ф4)
  await expect(page.getByRole('button', { name: '10 мин' })).toBeVisible();
  await expect(page.getByRole('button', { name: '15 мин' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'От объекта' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'К объекту' })).toBeVisible();

  // зона построена: подпись длительности + площадь + источник (кэш/расчёт/демо-модель)
  await expect(page.getByText(/км²/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/из кэша|новый расчёт|демо-модель/).first()).toBeVisible();

  // в демо-режиме обязателен бейдж «ДЕМО-ДАННЫЕ» (Приложение C)
  const mode = await status(request);
  if (mode.isochroneProvider === 'mock') {
    await expect(page.getByText(/ДЕМО-ДАННЫЕ|демо-модель/i).first()).toBeVisible();
  }

  // вердикт и раскрывающаяся методика
  await expect(page.getByText(/Отчёт доступности/)).toBeVisible();
  await page.getByRole('button', { name: /Как это считается/ }).click();
  await expect(page.getByText(/Isochrone API|демо-модель/i).first()).toBeVisible();

  // дисклеймер обязателен (§7 Ф4)
  await expect(page.getByText(/оценкой|Не использовать для принятия решений/i).first()).toBeVisible();
});

test('UI: пакетный режим — страница «Доступность» строит зоны и показывает покрытие', async ({ page }) => {
  await page.goto('/accessibility');
  await expect(page.getByRole('heading', { name: /Пешая доступность/ })).toBeVisible();

  await page.getByRole('button', { name: /Построить изохроны/ }).click();
  await expect(page.getByText(/Построено:/)).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole('table', { name: 'Покрытие территории по МО' })).toBeVisible();
  // либо покрытие посчитано, либо честное сообщение об отсутствии зон
  const hasCoverage = await page.getByText(/Покрыто территории/).isVisible();
  expect(hasCoverage).toBeTruthy();
});
