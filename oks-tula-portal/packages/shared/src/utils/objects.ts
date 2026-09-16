import type { LngLat } from '../types/api';
import { STATUSES } from '../dictionaries/statuses';
import type { StatusGroupCode } from '../types/domain';

/**
 * «Разноска» совпадающих координат (§5 ТЗ: 2 пары объектов с одинаковыми
 * точками — обязательная кластеризация/разноска + индикатор «здесь несколько
 * объектов»). Смещение детерминированное: объекты группы раскладываются
 * по малой окружности вокруг исходной точки.
 */
export function spreadCoincidentPoint(point: LngLat, indexInGroup: number, groupSize: number): LngLat {
  if (groupSize <= 1 || indexInGroup === 0 && groupSize === 1) return point;
  if (groupSize <= 1) return point;
  const angle = (2 * Math.PI * indexInGroup) / groupSize;
  // ~100 м по долготе и ~65 м по широте на широте Тулы
  const radiusLon = 0.0015;
  const radiusLat = 0.0006;
  return [point[0] + radiusLon * Math.cos(angle), point[1] + radiusLat * Math.sin(angle)];
}

/** Группирует объекты по идентичным координатам; возвращает индекс и размер группы. */
export function groupCoincidentPoints<T extends { id: string; point: LngLat | null }>(
  items: T[],
): Map<string, { index: number; size: number }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!item.point) continue;
    const key = `${item.point[0].toFixed(6)},${item.point[1].toFixed(6)}`;
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }
  const result = new Map<string, { index: number; size: number }>();
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    // стабильный порядок — по id, чтобы разноска не «прыгала» между запросами
    arr.sort((a, b) => a.id.localeCompare(b.id));
    arr.forEach((item, index) => result.set(item.id, { index, size: arr.length }));
  }
  return result;
}

/** code статуса → группа статуса. */
export function statusGroupOf(statusCode: string | null | undefined): StatusGroupCode | null {
  if (!statusCode) return null;
  return STATUSES.find((s) => s.code === statusCode)?.group ?? null;
}

// Расстояния (haversineKm/haversineM) — в utils/geo.ts (единое место, итерация 4).
