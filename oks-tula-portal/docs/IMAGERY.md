# IMAGERY — архивные снимки «До» и геопривязка рендеров «После» (Ф3)

## Важный факт (§4.5)

**У 2ГИС нет архива спутниковых снимков прошлых лет.** Слои 2ГИС остаются базовой
подложкой и источником POI/зданий, но «снимок до начала строительства» берётся из
открытых архивов или фотоархива заказчика.

## Источники архивных снимков

| Источник | Покрытие | Разрешение | Период |
|---|---|---|---|
| **Sentinel-2** (Copernicus) | глобальное | 10 м | с 2015 г. |
| **Landsat** (USGS) | глобальное | 30 м | с 1984 г. |
| **Геопортал Роскосмоса** `gptl.ru` | РФ | varies | varies |
| Фотоархив заказчика | по объектам | фото | по факту |

Загрузка: USGS EarthExplorer, Copernicus Open Access Hub / Browser.

## Процедура подготовки мозаик (целевая, этап 2)

1. **Отбор сцен** по объекту/МО и годам; исключение облачных кадров (cloud cover < 10 %).
2. **Атмосферная коррекция** и приведение к единому CRS **EPSG:3857** (Web Mercator).
3. **Сшивка мозаик по годам** (cloud-free composites), нарезка на тайлы (XYZ/TMS)
   либо публикация **WMS/WMTS** через GeoServer/MapServer/TileServer.
4. **Публикация** на собственном тайл/WMS-сервере (on-premise), подключение в MapGL через
   `mapgl.RasterTileSource` (URL-функция от `x, y, zoom, bbox`; bbox в EPSG:3857),
   **обязательный `attribution`** с копирайтом источника (Sentinel-2/ESA, Landsat/USGS).
5. **Метаданные** в `media_assets` (kind=`before_sat`, `year`, `taken_at`, `bounds`,
   `license`, `source`).

## Подключение в MapGL (§4.1)

```ts
// растровый источник WMS/WMTS (схема — в DECISIONS D10)
const source = new mapgl.RasterTileSource(map, {
  url: (x, y, zoom, bbox) =>
    `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&LAYERS=${layer}&STYLES=&CRS=EPSG:3857&BBOX=${bbox.join(',')}` +
    `&WIDTH=256&HEIGHT=256&FORMAT=image/png`,
  attribution: '© Sentinel-2 (ESA) / Landsat (USGS), обработка — Министерство строительства ТО',
});
```

## Геопривязка одиночного изображения (архитектурный рендер «После»)

Варианты (выбор фиксируется в `DECISIONS` при реализации, итерация 3):
- **растровый источник с одним изображением** через свой тайл-сервер (bounds → тайлы);
- **DOM-оверлей** с пересчётом координат углов через проекцию карты.
Рендер загружается в админке с геопривязкой (4 угла или `bounds`), предпросмотром,
версией/датой, автором и лицензией. Если рендера нет — блок «Материалы не предоставлены»
+ форма запроса у заказчика.

## Режимы сравнения (Ф3)

Шторка (swipe), бок о бок, плавное наложение с регулятором прозрачности, «было/стало»
одной кнопкой — все с синхронизацией вьюпорта (одинаковый центр/zoom/угол камеры).
Таймлапс — слайдер по датам + автовоспроизведение (с учётом `prefers-reduced-motion`, §8).

## MVP (итерация 3)

`HistoricalImageryProvider=mock`: интерфейс + мок-тайлы/мок-изображения в
`data/mock/media/`, в БД `is_mock=true`, бейдж «ДЕМО-ДАННЫЕ». Реальные мозаики — на этапе 2
по процедуре выше.

## Скрипты

- **Демо-медиа** (кадры «До/В процессе/После» + снимки камер для 10 объектов):
  `python3 etl/tools/generate_mock_media.py` → создаёт SVG-плейсхолдеры в
  `data/mock/media/` и `manifest.json`, который читает `apps/api/prisma/seed.ts`
  (`seedMockMedia`/`seedMockCameras`, `is_mock=true`). Каждый кадр содержит явную
  пометку «ДЕМО-ДАННЫЕ · не является реальным фото/снимком».
- **Реальные мозаики Sentinel-2/Landsat** (этап 2): `etl/tools/prepare_imagery_mosaic.py`
  — документируемый шаблон GDAL-пайплайна (отбор сцен → атмосферная коррекция →
  маскирование облаков → годовой композит → EPSG:3857 → нарезка тайлов). Для запуска
  нужны GDAL/rasterio и доступ к архивам; публикация — GeoServer (WMS/WMTS),
  подключение — `WmsHistoricalImageryProvider` (`IMAGERY_PROVIDER=live`, `IMAGERY_WMS_URL`).

## Провайдеры (адаптеры, §10)

- `HistoricalImageryProvider` (`apps/api/src/integrations/imagery/`): `Mock…` (MVP) и
  `Wms…` (боевой, строит WMS GetMap URL для `RasterTileSource`). Статус —
  `GET /api/v1/imagery/status`.
- `CameraProvider` (`apps/api/src/integrations/camera/`): `Mock…` (статичный кадр +
  псевдо-«живой» таймстемп) и `Live…` (реальные HLS/RTSP + медиа-сервер). На фронте
  HLS воспроизводится через `hls.js` (динамический импорт), с откатом на постер/таймстемп.
