# API — REST-контракты `/api/v1` (OpenAPI 3.1)

Живая спецификация Swagger: **`/api/docs`** (`/api/docs/openapi.json`). Базовый путь —
`/api/v1`; healthcheck — `/api/health` (без версии). Единый формат ошибок
`{ error: { code, message, details? } }`, пагинация `{ items, total, page, limit }`.

Реализовано в итерациях 0–4 (✔); запланировано (§11) — отмечено итерацией.

## Объекты

- ✔ `GET /api/v1/objects` — список с фильтрами и пагинацией.
  Query: `industry` (повтор), `status`, `statusGroup`, `municipality`, `ownership`,
  `q` (поиск по названию/адресу/подрядчику), `yearFrom`, `yearTo`, `readinessMin`,
  `hasGeometry` (`true|false`), `bbox=minLon,minLat,maxLon,maxLat`, `sort`
  (`name|commissioningYear|readiness|yearEnd`), `page`, `limit` (≤200).
  Ответ: `Paginated<ObjectSummary>`; у каждого — `point` (точная), `displayPoint`
  (точная или центроид МО), `locationApproximate`, `statusGroup`, `readinessPct`.
- ✔ `GET /api/v1/objects/{id}` — полная карточка `ObjectDetails` (блоки Ф2: сводка,
  участники, сроки/документы, экспертиза, таймлайн, `raw` для блока «Прозрачность»).
- ✔ `GET /api/v1/objects/{id}/geojson` — GeoJSON `Feature`.
- ✔ `GET /api/v1/objects/{id}/contracts` (Ф6; на MVP — демо-данные из сида).
- ✔ `GET /api/v1/objects/{id}/media` (Ф3) — кадры «До/В процессе/После» (`media_assets`).
- ✔ `GET /api/v1/objects/{id}/cameras` (Ф3) — камеры стройплощадки.
- ✔ `GET /api/v1/objects/{id}/appeals` (Ф8) — публичные обезличенные обращения (подача — итерация 6).
- ✔ `GET /api/v1/export?format=csv|xlsx|geojson` (Ф9) — экспорт текущей выборки (те же фильтры, что `/objects`).
- ✔ `GET /api/v1/imagery/status` (Ф3) — режим провайдеров архивных снимков/камер, доступные годы, attribution.
- ✔ `GET /api/v1/objects/{id}/isochrone?duration=600,900&reverse=false&transport=walking&allowApproximate=false`
  (Ф4) — зоны пешей доступности: кэш PostGIS → Isochrone API 2ГИС (см. раздел «Изохроны»).
- ✔ `GET /api/v1/objects/{id}/accessibility-report?duration=900&reverse=true&allSpheres=false&refreshPoi=false`
  (Ф4) — отчёт доступности: площадь зоны, население, жилые дома, POI по сферам, объекты
  той же сферы, вердикт с методикой и дисклеймером.

## Справочники и МО

- ✔ `GET /api/v1/dictionaries` — перечень доступных справочников.
- ✔ `GET /api/v1/dictionaries/{kind}` — элементы (`industry|status|municipality|
  appeal-category|program|organization|capacity-unit`); заголовки `ETag`, `Cache-Control`.
- ✔ `GET /api/v1/municipalities` — список МО (центроид, площадь, население, плотность).
- ✔ `GET /api/v1/municipalities/geojson` — `FeatureCollection` границ МО (для хороплета Ф5).
- ✔ `GET /api/v1/municipalities/{id}` — карточка МО.
- ⏳ `GET /api/v1/municipalities/{id}/social-provision` (Ф5, итерация 5).

## Аналитика и качество данных

- ✔ `GET /api/v1/analytics/summary` — сводка `AnalyticsSummary` (главная/дашборд Ф9):
  всего, по группам статусов, отраслям, МО, годам ввода, суммарная площадь, средняя
  готовность активных, `withoutExactLocationCount`, `isMockParts`.
- ✔ `GET /api/v1/analytics/risks` — объекты риска (срок контракта истёк при готовности < 100).
- ✔ `GET /api/v1/data-quality` — отчёт ETL (`reports/data_quality.json`).
- ⏳ `GET /api/v1/social-provision`, `/api/v1/satisfaction` (Ф5/Ф7, итерация 5).

## Изохроны и доступность (Ф4)

- ✔ `GET /api/v1/objects/{id}/isochrone` — зоны пешей доступности.
  Query: `duration` (1–5 значений 60–3600 с, списком `600,900` или повтором параметра),
  `reverse` (`true` — «к объекту»), `transport` (MVP — `walking`),
  `allowApproximate` (`true` — разрешить расчёт от центроида МО для объектов без геометрии,
  §6.3 п.7). Ответ `IsochroneResult`: `zones[]` (`durationSec`, `durationLabel`, `geometry`
  MultiPolygon, `areaM2`, `source: cache|api|model`, `isMock`, `generatedAt`, `expiresAt`),
  `available`, `unavailableReason` (`no_geometry|provider_error|quota|not_found|disabled`),
  `stats` (сколько зон из кэша/построено/ошибок), `disclaimer`.
  При `available=false` геометрия **не имитируется** (§15.1).
- ✔ `GET /api/v1/objects/{id}/accessibility-report` — отчёт доступности
  (`AccessibilityReport`): зона и её площадь, `population` (оценка: плотность МО × площадь
  зоны, с методом/источником/`isMock`), `residentialBuildings`, `poi[]` по сферам
  (`count=null` + `gapReason` в демо-режиме), `sameSphere.inside/nearest` (объекты реестра
  ОКС с расстоянием по прямой и оценкой времени), `verdict`
  (`closes_deficit|duplicates|improves|insufficient_data` + `basis[]` + `confidence`),
  `methodology[]`, `disclaimer`. Query: как у `/isochrone` + `allSpheres`, `refreshPoi`.
- ✔ `GET /api/v1/isochrone/status` — режимы провайдеров (`isochrone`, `poi`), признак
  демо-геометрии, пресеты времени, размеры кэша, число зон в кэше, метрики расхода квот.
- ✔ `GET /api/v1/isochrone/coverage?sphere=&industry=&municipality=&statusGroup=&duration=900&reverse=&allowApproximate=`
  — сводное покрытие и «белые пятна» по МО (пакетный режим). Считается в PostGIS
  (`ST_Union` → `ST_Intersection` / `ST_Difference` / `ST_Area`) **только по зонам из кэша** —
  вызовов API не делает. При отсутствии зон: `hasData=false`, `coverage=null`,
  `whiteSpots=null` + пояснение (территория не объявляется непокрытой, §15.1).
- ✔ `POST /api/v1/isochrone/batch` (тело — те же фильтры + `durations`, `force`) —
  пакетное построение зон для выборки (лимит `ISOCHRONE_BATCH_MAX_OBJECTS`, параллелизм 4,
  rate limit 3 запроса/мин). Возвращает счётчики `built/fromCache/failed/skippedNoGeometry`
  и перечень объектов со статусами.
- Методика расчётов — `docs/METHODOLOGY.md` §3.

## Гео-прокси 2ГИС (§4.5)

- ✔ `GET /api/v1/geo/geocode?q=&limit=` — геокодинг через бэкенд (кэш, rate limit).
  В демо-режиме (`GEOCODER_PROVIDER=mock`) возвращает пустой результат с пометой —
  координаты не выдумываются.
- ✔ `GET /api/v1/geo/rubrics?q=` — прокси Categories API (`2.0/catalog/rubric/search`):
  `id`/`alias`/`name` рубрик региона. Нужен, чтобы сверить рубрикатор и заполнить
  `config/poi_rubrics.ts` перед боевым подключением Search API (§4.4). В демо-режиме —
  помета `provider_mock` без данных.
- ✔ `GET /api/v1/geo/providers` — режимы интеграций (включая `isochrone`/`poi`) и метрики
  расхода квот; при `live` без ключа — честное `misconfigured` вместо падения.
- Все маршруты `/geo/*` под `ThrottlerGuard` (по IP, настраивается `RATE_LIMIT_GEO_PER_MIN`).
- Зоны доступности вынесены из `/geo/isochrone` (статус-заглушка итераций 0–3) в
  `/objects/{id}/isochrone` и `/isochrone/*` — как в §11 ТЗ (см. `DECISIONS` D19).

## Обращения, экспорт, поиск, служебная зона (следующие итерации)

- ⏳ `POST /api/v1/appeals` (multipart, `Idempotency-Key`), `GET /api/v1/appeals/{publicId}` (Ф8).
- ⏳ `GET /api/v1/search?q=&type=object|address|organization` (Ф9).
- ⏳ `GET /api/v1/export?format=csv|geojson|xlsx&<фильтры>` (Ф9).
- ⏳ `POST /api/v1/admin/*` под RBAC: объекты, медиа, справочники, модерация, аудит (§7 Ф9).

## Служебное

- ✔ `GET /api/health` — `{ status, database, uptimeSec, version, mapglKeyPresent, mockProviders[] }`.

## Контракты типов

Общие типы (`ObjectSummary`, `ObjectDetails`, `ObjectsFilters`, `Paginated<T>`,
`AnalyticsSummary`, `ApiErrorEnvelope`, GeoJSON, `IsochroneResult`, `AccessibilityReport`,
`CoverageResult`, `IsochroneBatchResult`, `IsochroneStatus`) — в `packages/shared`
(§2: типизированные контракты frontend/backend). Клиент — `apps/web/src/lib/api-client.ts`.
