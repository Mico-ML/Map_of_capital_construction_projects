/**
 * Геометрические утилиты ETL без внешних зависимостей:
 * точка-в-полигоне (ray casting), центроид, загрузка границ МО из GeoJSON.
 * В PostGIS те же операции выполняются ST_Contains/ST_Centroid — здесь
 * дублируется логика для «сухого прогона» ETL без БД и отчёта качества.
 */

import type { GeoJsonFeature, GeoJsonFeatureCollection, LngLat } from '@oks/shared';
import { MUNICIPALITIES } from '@oks/shared';

export type Ring = [number, number][];
export type PolygonRings = Ring[]; // [0] — outer, остальные — holes

export interface MunicipalityGeometry {
  municipalityId: string;
  osmName: string;
  /** Все полигоны МО (обычно один). Каждый: outer + holes. */
  polygons: PolygonRings[];
  /** Центроид наибольшего полигона — точка «местоположение уточняется». */
  centroid: LngLat;
  areaKm2: number;
  source: string;
}

/** Лучевой тест «точка в кольце» (lon/lat). */
export function pointInRing(point: LngLat, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Точка в полигоне с учётом отверстий. */
export function pointInPolygon(point: LngLat, rings: PolygonRings): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((h) => pointInRing(point, h));
}

/** Центроид по формуле площади (shoelace) для наибольшего внешнего кольца. */
export function polygonCentroid(rings: PolygonRings): LngLat {
  const outer = rings[0];
  if (!outer || outer.length === 0) return [0, 0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i, i += 1) {
    const [xj, yj] = outer[j];
    const [xi, yi] = outer[i];
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    // вырожденный полигон — среднее точек
    const sx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const sy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    return [sx, sy];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

function ringArea(ring: Ring): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Загрузка границ МО из GeoJSON (data/geo/municipalities.geojson).
 * Связывание фич со справочником — по osmName (properties.name).
 */
export function loadMunicipalityGeometries(
  geojson: GeoJsonFeatureCollection,
): Map<string, MunicipalityGeometry> {
  const byOsmName = new Map(MUNICIPALITIES.map((m) => [m.osmName, m]));
  const result = new Map<string, MunicipalityGeometry>();

  for (const feature of geojson.features as GeoJsonFeature[]) {
    const props = feature.properties as Record<string, unknown>;
    const osmName = String(props['name'] ?? '');
    const ref = byOsmName.get(osmName);
    if (!ref) continue;

    const polygons: PolygonRings[] = [];
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      polygons.push(geom.coordinates as unknown as Ring[]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates as unknown as Ring[][]) polygons.push(poly);
    }
    if (polygons.length === 0) continue;

    // центроид — у наибольшего полигона
    let largest = polygons[0];
    let largestArea = ringArea(largest[0]);
    for (const p of polygons) {
      const a = ringArea(p[0]);
      if (a > largestArea) {
        largest = p;
        largestArea = a;
      }
    }
    const centerFromProps = props['center'] as [number, number] | null | undefined;

    result.set(ref.id, {
      municipalityId: ref.id,
      osmName,
      polygons,
      centroid: centerFromProps ?? polygonCentroid(largest),
      areaKm2: Number(props['area_km2'] ?? 0),
      source: String(props['source'] ?? 'unknown'),
    });
  }
  return result;
}

/** МО, содержащий точку (или null). */
export function municipalityContaining(
  point: LngLat,
  geometries: Map<string, MunicipalityGeometry>,
): string | null {
  for (const [id, g] of geometries) {
    if (g.polygons.some((rings) => pointInPolygon(point, rings))) return id;
  }
  return null;
}
