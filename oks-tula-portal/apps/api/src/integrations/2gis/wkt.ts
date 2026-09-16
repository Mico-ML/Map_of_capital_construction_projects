import type { GeoJsonMultiPolygon } from '@oks/shared';

/**
 * Конвертация WKT ⇄ GeoJSON (§4.2: «WKT → GeoJSON конвертируй на бэкенде»).
 * Собственный парсер вместо внешних пакетов (`wellknown`/`wkt-parser`):
 *   - не тянет зависимость, работающую с GeoJSON старого формата (§15.2 — только
 *     документированные форматы, никаких «удобных» библиотек с неизвестным статусом);
 *   - покрывает ровно то, что возвращает Isochrone API: MULTIPOLYGON / POLYGON
 *     (проверено фактически — §4.6: `format:"wkt"`, два MULTIPOLYGON);
 *   - unit-тестируется без сети и БД (§3: расчёты покрыты тестами).
 *
 * Геометрия из ответа Isochrone API передаётся в Search API параметром `polygon`
 * НАПРЯМУЮ этим же WKT (§4.6), поэтому исходная строка сохраняется в
 * `IsochroneZoneRaw.wkt`.
 */

type NumericNode = string | WktNode[];
type WktNode = NumericNode;

const SUPPORTED_TYPES = ['MULTIPOLYGON', 'POLYGON'] as const;

/** Рекурсивный разбор скобочной структуры WKT в дерево массивов и чисел. */
function parseNodes(text: string): WktNode[] {
  const root: WktNode[] = [];
  const stack: WktNode[][] = [root];
  let buffer = '';
  const flush = (): void => {
    const token = buffer.trim();
    if (token !== '') stack[stack.length - 1].push(token);
    buffer = '';
  };
  for (const char of text) {
    if (char === '(') {
      flush();
      const child: WktNode[] = [];
      stack[stack.length - 1].push(child);
      stack.push(child);
    } else if (char === ')') {
      flush();
      if (stack.length > 1) stack.pop();
    } else if (char === ',' || char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      // разделители WKT: запятая между элементами и пробел между lon и lat
      flush();
    } else {
      buffer += char;
    }
  }
  flush();
  return root;
}

/** Плоский список чисел → массив пар [lon, lat]. */
function toCoordinates(values: string[]): [number, number][] | null {
  if (values.length < 6 || values.length % 2 !== 0) return null;
  const coords: [number, number][] = [];
  for (let i = 0; i < values.length; i += 2) {
    const lon = Number.parseFloat(values[i]);
    const lat = Number.parseFloat(values[i + 1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    coords.push([lon, lat]);
  }
  return coords;
}

function isNodeArray(node: WktNode): node is WktNode[] {
  return Array.isArray(node);
}

/** Кольцо из дерева: массив строк-чисел → координаты (с замыканием кольца). */
function ringFromNode(node: WktNode): [number, number][] | null {
  if (!isNodeArray(node)) return null;
  const values = node.filter((n): n is string => typeof n === 'string');
  const coords = toCoordinates(values);
  if (!coords) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
  return coords;
}

/** Полигон (внешнее кольцо + отверстия) из дерева. */
function polygonFromNode(node: WktNode): [number, number][][] | null {
  if (!isNodeArray(node)) return null;
  const rings: [number, number][][] = [];
  for (const child of node) {
    const ring = ringFromNode(child);
    if (ring) rings.push(ring);
  }
  return rings.length > 0 ? rings : null;
}

export interface WktGeometry {
  type: 'MULTIPOLYGON' | 'POLYGON';
  geometry: GeoJsonMultiPolygon;
}

/**
 * WKT MULTIPOLYGON/POLYGON → GeoJSON MultiPolygon (POLYGON нормализуется
 * в MultiPolygon — схема БД `geometry(MultiPolygon,4326)`, §6.2).
 * Возвращает null для пустого/некорректного WKT — вызывающий код обязан
 * показать «Нет данных», а не подменять геометрию (§15.1).
 */
export function wktToGeoJson(wkt: string): WktGeometry | null {
  const trimmed = wkt.trim();
  if (trimmed === '') return null;
  const upper = trimmed.toUpperCase();
  const type = SUPPORTED_TYPES.find((t) => upper.startsWith(t));
  if (!type) return null;
  if (upper.includes('EMPTY')) return null;

  const body = trimmed.slice(type.length).trim();
  const nodes = parseNodes(body);
  // parseNodes возвращает [корневой_узел]; для MULTIPOLYGON внутри — полигоны,
  // для POLYGON — кольца.
  const outer = nodes.find(isNodeArray);
  if (!outer) return null;

  const polygons: [number, number][][][] = [];
  if (type === 'MULTIPOLYGON') {
    for (const child of outer) {
      const polygon = polygonFromNode(child);
      if (polygon) polygons.push(polygon);
    }
  } else {
    const polygon = polygonFromNode(outer);
    if (polygon) polygons.push(polygon);
  }
  if (polygons.length === 0) return null;

  return {
    type,
    geometry: { type: 'MultiPolygon', coordinates: polygons as unknown as number[][][][] },
  };
}

/**
 * GeoJSON MultiPolygon → WKT MULTIPOLYGON.
 * Нужен, чтобы геометрию демо-модели можно было передать в Search API тем же
 * параметром `polygon` (§4.6: принимается только WKT).
 */
export function geoJsonToWkt(geometry: GeoJsonMultiPolygon): string | null {
  if (geometry.type !== 'MultiPolygon') return null;
  const polygons = geometry.coordinates as unknown as [number, number][][][];
  const parts: string[] = [];
  for (const rings of polygons) {
    const ringParts: string[] = [];
    for (const ring of rings) {
      if (ring.length < 4) return null;
      const coords = ring.map(([lon, lat]) => `${formatCoord(lon)} ${formatCoord(lat)}`);
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first !== last) coords.push(first);
      ringParts.push(`(${coords.join(', ')})`);
    }
    if (ringParts.length > 0) parts.push(`(${ringParts.join(', ')})`);
  }
  return parts.length > 0 ? `MULTIPOLYGON(${parts.join(', ')})` : null;
}

/** Координаты — до 6 знаков (точность ~0,1 м), лишние нули убираются. */
function formatCoord(value: number): string {
  return String(Number(value.toFixed(6)));
}

/** Число вершин геометрии — для логов и контроля «тяжёлости» полигона. */
export function countVertices(geometry: GeoJsonMultiPolygon): number {
  const polygons = geometry.coordinates as unknown as [number, number][][][];
  return polygons.reduce((sum, rings) => sum + rings.reduce((s, r) => s + r.length, 0), 0);
}
