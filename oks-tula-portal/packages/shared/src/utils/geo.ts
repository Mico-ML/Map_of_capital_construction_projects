import type { LngLat } from '../types/api';
import type { GeoJsonMultiPolygon, GeoJsonPolygon } from '../types/geo';
import { WALKING_SPEED_MPS } from '../config/isochrone';

/**
 * Геометрические утилиты без внешних зависимостей (shared): расстояния, площадь
 * полигона в м², точка-в-полигоне, границы. Используются API (отчёт доступности,
 * «белые пятна» как fallback-проверка) и UI (подписи, центрирование).
 * В PostGIS те же операции выполняются ST_Distance/ST_Area/ST_Contains —
 * здесь логика продублирована для unit-тестов без БД (§3: расчёты покрыты тестами).
 */

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Расстояние между точками, м (гаверсинус). */
export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Расстояние между точками, км (гаверсинус). */
export function haversineKm(a: LngLat, b: LngLat): number {
  return haversineM(a, b) / 1000;
}

/**
 * Оценка времени пешком по прямой: distance / WALKING_SPEED_MPS.
 * ВНИМАНИЕ: это оценка «по прямой», а не маршрут по пешеходной сети (§7 Ф4).
 */
export function estimateWalkMinutes(distanceM: number | null, speedMps = WALKING_SPEED_MPS): number | null {
  if (distanceM === null || !Number.isFinite(distanceM) || speedMps <= 0) return null;
  return Math.round((distanceM / speedMps / 60) * 10) / 10;
}

/**
 * Площадь кольца в м² по сферической формуле (chamberlain & duquette) —
 * достаточно точно для зон в несколько км².
 */
function ringAreaM2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [lon1, lat1] = ring[j];
    const [lon2, lat2] = ring[i];
    total += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Площадь Polygon (внешнее кольцо минус отверстия), м². */
export function polygonAreaM2(polygon: GeoJsonPolygon): number {
  const rings = polygon.coordinates as unknown as [number, number][][];
  const [outer, ...holes] = rings;
  if (!outer) return 0;
  const holesArea = holes.reduce((sum, h) => sum + ringAreaM2(h), 0);
  return Math.max(0, ringAreaM2(outer) - holesArea);
}

/** Площадь MultiPolygon, м². */
export function multiPolygonAreaM2(multi: GeoJsonMultiPolygon): number {
  const polygons = multi.coordinates as unknown as [number, number][][][];
  return polygons.reduce((sum, rings) => {
    const [outer, ...holes] = rings;
    if (!outer) return sum;
    return sum + Math.max(0, ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0));
  }, 0);
}

/** м² → км² (3 знака). */
export function m2ToKm2(areaM2: number | null): number | null {
  if (areaM2 === null || !Number.isFinite(areaM2)) return null;
  return Math.round((areaM2 / 1e6) * 1000) / 1000;
}

/** Лучевой тест «точка в кольце». */
function pointInRing(point: LngLat, ring: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Точка в Polygon с учётом отверстий. */
export function pointInPolygon(point: LngLat, polygon: GeoJsonPolygon): boolean {
  const rings = polygon.coordinates as unknown as [number, number][][];
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((h) => pointInRing(point, h));
}

/** Точка в MultiPolygon. */
export function pointInMultiPolygon(point: LngLat, multi: GeoJsonMultiPolygon): boolean {
  const polygons = multi.coordinates as unknown as [number, number][][][];
  return polygons.some((rings) => {
    const [outer, ...holes] = rings;
    if (!outer || !pointInRing(point, outer)) return false;
    return !holes.some((h) => pointInRing(point, h));
  });
}

/** Границы MultiPolygon: [[minLon, minLat], [maxLon, maxLat]] (для fitBounds). */
export function multiPolygonBounds(multi: GeoJsonMultiPolygon): [LngLat, LngLat] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const polygons = multi.coordinates as unknown as [number, number][][][];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/**
 * Смещение точки на заданные метры по азимуту (плоское приближение с поправкой
 * на широту) — используется демо-моделью зоны и «разноской» дублей координат.
 */
export function destinationPoint(origin: LngLat, distanceM: number, azimuthDeg: number): LngLat {
  const latRad = toRad(origin[1]);
  const dLat = (distanceM * Math.cos(toRad(azimuthDeg))) / EARTH_RADIUS_M;
  const dLon = (distanceM * Math.sin(toRad(azimuthDeg))) / (EARTH_RADIUS_M * Math.cos(latRad));
  return [origin[0] + (dLon * 180) / Math.PI, origin[1] + (dLat * 180) / Math.PI];
}
