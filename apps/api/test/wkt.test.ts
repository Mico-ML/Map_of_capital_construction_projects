import { describe, expect, it } from 'vitest';
import { geoJsonToWkt, wktToGeoJson } from '../src/integrations/2gis/wkt';
import type { GeoJsonMultiPolygon } from '@oks/shared';
import { multiPolygonAreaM2, pointInMultiPolygon } from '@oks/shared';

/**
 * Конвертация WKT ⇄ GeoJSON (§4.2: «конвертируй на бэкенде»).
 * Форматы строк — по фактическому ответу Isochrone API 2ГИС (§4.6) и справочнику
 * docs.2gis.com/api/navigation/isochrone/reference/isochrone_200.
 */

// Фрагмент реального ответа Isochrone API (пример из документации 2ГИС):
// MULTIPOLYGON с несколькими частями и отверстиями.
const DOC_SAMPLE =
  'MULTIPOLYGON(((37.661787 55.758335, 37.66769 55.760068, 37.668369 55.759247, ' +
  '37.674587 55.759466, 37.674045 55.762558, 37.661787 55.758335)), ' +
  '((37.650000 55.750000, 37.660000 55.750000, 37.660000 55.760000, 37.650000 55.760000, 37.650000 55.750000), ' +
  '(37.653000 55.753000, 37.657000 55.753000, 37.657000 55.757000, 37.653000 55.757000, 37.653000 55.753000)))';

describe('wktToGeoJson', () => {
  it('разбирает MULTIPOLYGON из примера документации 2ГИС', () => {
    const parsed = wktToGeoJson(DOC_SAMPLE);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('MULTIPOLYGON');
    const coords = parsed?.geometry.coordinates as unknown as [number, number][][][];
    expect(coords).toHaveLength(2);
    expect(coords[0]).toHaveLength(1); // без отверстий
    expect(coords[1]).toHaveLength(2); // внешнее кольцо + отверстие
    expect(coords[0][0][0]).toEqual([37.661787, 55.758335]);
  });

  it('замыкает кольцо, если ответ не замкнут', () => {
    const parsed = wktToGeoJson('POLYGON((37.6 55.7, 37.7 55.7, 37.7 55.8))');
    const ring = (parsed?.geometry.coordinates as unknown as [number, number][][][])[0][0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(4);
  });

  it('нормализует POLYGON в MultiPolygon (схема БД — MultiPolygon, §6.2)', () => {
    const parsed = wktToGeoJson('POLYGON((37.6 55.7, 37.7 55.7, 37.7 55.8, 37.6 55.7))');
    expect(parsed?.type).toBe('POLYGON');
    expect(parsed?.geometry.type).toBe('MultiPolygon');
    expect((parsed?.geometry.coordinates as unknown as number[][][][])).toHaveLength(1);
  });

  it('переносит переносы строк и лишние пробелы', () => {
    const parsed = wktToGeoJson('MULTIPOLYGON (((\n 37.6 55.7,\n 37.7 55.7,\n 37.7 55.8,\n 37.6 55.7\n)))');
    expect(parsed).not.toBeNull();
    expect((parsed?.geometry.coordinates as unknown as [number, number][][][])[0][0]).toHaveLength(4);
  });

  it('отклоняет пустые и неподдерживаемые геометрии (не выдумывая замену, §15.1)', () => {
    expect(wktToGeoJson('')).toBeNull();
    expect(wktToGeoJson('MULTIPOLYGON EMPTY')).toBeNull();
    expect(wktToGeoJson('LINESTRING(37.6 55.7, 37.7 55.8)')).toBeNull();
    expect(wktToGeoJson('MULTIPOLYGON(((37.6 55.7, 37.7 55.8)))')).toBeNull(); // меньше 3 точек
    expect(wktToGeoJson('MULTIPOLYGON(((999 55.7, 37.7 55.8, 37.8 55.9)))')).toBeNull(); // lon вне диапазона
    expect(wktToGeoJson('не геометрия')).toBeNull();
  });

  it('площадь и точка-в-полигоне считаются по разобранной геометрии', () => {
    const parsed = wktToGeoJson('POLYGON((37.60 55.70, 37.61 55.70, 37.61 55.71, 37.60 55.71, 37.60 55.70))');
    const geom = parsed?.geometry as GeoJsonMultiPolygon;
    const area = multiPolygonAreaM2(geom);
    // ~0.01° × 0.01° на широте 55.7 ≈ 640 × 1113 м ≈ 0.71 км²
    expect(area).toBeGreaterThan(600_000);
    expect(area).toBeLessThan(850_000);
    expect(pointInMultiPolygon([37.605, 55.705], geom)).toBe(true);
    expect(pointInMultiPolygon([37.62, 55.705], geom)).toBe(false);
  });

  it('отверстие исключает точку из полигона', () => {
    const parsed = wktToGeoJson(DOC_SAMPLE);
    const geom = parsed?.geometry as GeoJsonMultiPolygon;
    // точка внутри отверстия второй части
    expect(pointInMultiPolygon([37.655, 55.755], geom)).toBe(false);
    // точка внутри внешнего кольца второй части, но вне отверстия
    expect(pointInMultiPolygon([37.651, 55.751], geom)).toBe(true);
  });
});

describe('устойчивость к неполным данным', () => {
  it('обрыв WKT не приводит к исключению', () => {
    expect(wktToGeoJson('MULTIPOLYGON(((')).toBeNull();
    expect(wktToGeoJson('POLYGON()')).toBeNull();
    expect(wktToGeoJson('MULTIPOLYGON')).toBeNull();
  });
});

describe('geoJsonToWkt', () => {
  it('обратим: GeoJSON → WKT → GeoJSON даёт ту же геометрию', () => {
    const original: GeoJsonMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [37.6, 55.7],
            [37.7, 55.7],
            [37.7, 55.8],
            [37.6, 55.7],
          ],
        ],
      ] as unknown as number[][][][],
    };
    const wkt = geoJsonToWkt(original);
    expect(wkt).toMatch(/^MULTIPOLYGON\(\(\(/);
    const back = wktToGeoJson(wkt as string);
    expect(back?.geometry.coordinates).toEqual(original.coordinates);
  });

  it('сохраняет отверстия и округляет координаты до 6 знаков', () => {
    const geom: GeoJsonMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [37.61234567, 55.7],
            [37.7, 55.7],
            [37.7, 55.8],
            [37.61234567, 55.7],
          ],
          [
            [37.65, 55.75],
            [37.66, 55.75],
            [37.66, 55.76],
            [37.65, 55.75],
          ],
        ],
      ] as unknown as number[][][][],
    };
    const wkt = geoJsonToWkt(geom) as string;
    expect(wkt).toContain('37.612346 55.7');
    expect(wkt).toContain('), (');
    const back = wktToGeoJson(wkt);
    const rings = (back?.geometry.coordinates as unknown as [number, number][][][])[0];
    expect(rings).toHaveLength(2);
  });

  it('отклоняет вырожденные кольца', () => {
    const geom = {
      type: 'MultiPolygon',
      coordinates: [[[
        [37.6, 55.7],
        [37.7, 55.7],
      ]]] as unknown as number[][][][],
    } as GeoJsonMultiPolygon;
    expect(geoJsonToWkt(geom)).toBeNull();
  });
});
