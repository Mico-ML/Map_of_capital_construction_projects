/**
 * Минимальные GeoJSON-типы (без внешней зависимости).
 * Используются для слоёв карты, границ МО и изохрон.
 */

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  properties: P;
  geometry: GeoJsonGeometry;
}

export interface GeoJsonFeatureCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
}

/** Свойства границы МО в data/geo/municipalities.geojson. */
export interface MunicipalityBoundaryProps {
  osm_relation_id: number;
  name: string;
  admin_level: number;
  center: [number, number] | null;
  area_km2: number;
  source: string;
  fetched_at: string;
}
