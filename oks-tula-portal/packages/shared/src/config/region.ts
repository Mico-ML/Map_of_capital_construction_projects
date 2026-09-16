import type { LngLat } from '../types/api';

/**
 * Конфигурация региона для MapGL 2ГИС.
 * region_id = 36 проверен фактически на рабочем ключе 12.09.2026 (§4.6 ТЗ) —
 * справочник регионов из API 2ГИС НЕ получать (/3.0/regions возвращает ошибку).
 */
export const REGION_ID = 36;

/** Центр по умолчанию — Тула (§4.1 ТЗ). */
export const TULA_CENTER: LngLat = [37.6173, 54.1947];

/**
 * Границы Тульской области для ограничения панорамирования (maxBounds)
 * и стартового вида «вся область». Рассчитаны по реальным границам МО
 * (data/geo/municipalities.geojson, OpenStreetMap ODbL) с запасом ~0.1°.
 */
export const REGION_BOUNDS: [LngLat, LngLat] = [
  [36.05, 53.02],
  [38.75, 54.85],
];

/** Ограничения масштаба: область видна целиком, детализация до дома. */
export const MIN_ZOOM = 6.5;
export const MAX_ZOOM = 18;

/** Стартовый zoom (при загрузке вызывается setBounds(REGION_BOUNDS)). */
export const DEFAULT_ZOOM = 8.4;

/** Стиль карты 2ГИС: схема / «спутник» недоступен в MapGL без доп. подписки (§4.5). */
export const MAP_STYLE_DEFAULT = 'c080bb6a-a2ec-4a63-a4c8-6e2c1a9a4a92';

/**
 * Порог кластеризации маркеров (§4.1: кластеризация обязательна при >200 точках;
 * включаем раньше — при малом zoom объекты области сливаются).
 */
export const CLUSTER_MAX_ZOOM = 12;
