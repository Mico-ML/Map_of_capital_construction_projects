import { load as loadMapgl } from '@2gis/mapgl';

/** Точный URL скрипта MapGL (§4.1). */
export const MAPGL_SCRIPT_URL = 'https://mapgl.2gis.com/api/js/v1';

// Минимальные типы используемой части API MapGL 1.77 (пакет грузится лоадером).
export interface HtmlMarkerLike {
  destroy(): void;
}
/** Параметры mapgl.Polygon (документированы в MapGL: coordinates = [outer, ...holes]). */
export interface PolygonOptions {
  coordinates: number[][][];
  zIndex?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  interactive?: boolean;
  minZoom?: number;
  maxZoom?: number;
}
export interface MapLike {
  project(lngLat: number[]): number[];
  getZoom(): number;
  setCenter(c: number[]): void;
  setZoom(z: number): void;
  setRotation(r: number): void;
  getRotation(): number;
  fitBounds(b: number[][], o?: { padding?: number | Record<string, number> }): void;
  setStyleById(id: string): Promise<string>;
  on(event: string, cb: () => void): void;
  destroy(): void;
  getContainer(): HTMLElement;
}
export interface MapglLib {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => MapLike;
  HtmlMarker: new (map: MapLike, opts: { coordinates: number[]; html: string | HTMLElement; anchor?: number[] }) => HtmlMarkerLike;
  ZoomControl: new (map: MapLike, opts?: { position?: string }) => HtmlMarkerLike;
  ScaleControl: new (map: MapLike, opts?: { position?: string }) => HtmlMarkerLike;
  Control: new (map: MapLike, html: string, opts?: { position?: string }) => HtmlMarkerLike;
  /** Полигон (заполнение + обводка) — для изохрон и покрытия территории (Ф4). */
  Polygon: new (map: MapLike, opts: PolygonOptions) => HtmlMarkerLike;
  Polyline: new (
    map: MapLike,
    opts: { coordinates: number[][]; width?: number; color?: string; zIndex?: number },
  ) => HtmlMarkerLike;
}

let cached: Promise<MapglLib | null> | null = null;

/**
 * Загрузка библиотеки MapGL один раз на приложение (кэш промиса).
 * Возвращает null, если нет ключа или загрузка не удалась (graceful degradation, §9).
 */
export function loadMapglLib(): Promise<MapglLib | null> {
  if (!cached) {
    cached = loadMapgl(MAPGL_SCRIPT_URL)
      .then((lib) => lib as unknown as MapglLib)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Не удалось загрузить MapGL', err);
        return null;
      });
  }
  return cached;
}

/**
 * `#RRGGBB` → `#RRGGBBAA`: MapGL Polygon поддерживает RGBA-формат цвета
 * (документировано в PolygonOptions.color) — так задаётся полупрозрачность зон (§7 Ф4).
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${clean}${a}`;
}

/** Создать HTMLElement из строки (корневой узел) — для навешивания обработчиков. */
export function makeElement(html: string): HTMLElement {
  const tpl = document.createElement('div');
  tpl.innerHTML = html.trim();
  return (tpl.firstElementChild as HTMLElement | null) ?? tpl;
}
