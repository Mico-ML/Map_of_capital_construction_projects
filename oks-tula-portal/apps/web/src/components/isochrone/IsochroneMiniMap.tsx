import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import type { IsochroneZone, LngLat } from '@oks/shared';
import { DEFAULT_ZOOM, REGION_ID, multiPolygonBounds, zoneStyle } from '@oks/shared';
import { loadMapglLib, makeElement, withAlpha, type HtmlMarkerLike, type MapLike } from '../../lib/mapgl-loader';

const STYLE_SCHEME = 'c080bb6a-a2ec-4a63-a4c8-6e2c1a9a4a92';

interface Props {
  center: LngLat;
  zones: IsochroneZone[];
  height?: number;
  /** Метки объектов той же сферы (реестр ОКС) — реальные данные, не мок. */
  markers?: { point: LngLat; label: string; inside: boolean }[];
}

/**
 * Компактная карта зон пешей доступности для вкладки «Доступность» (§7 Ф4).
 * Использует те же mapgl.Polygon, что и основная карта: градация по времени,
 * демо-зона — бледнее и с тонкой обводкой (дублирование не только цветом, §8).
 */
export function IsochroneMiniMap({ center, zones, height = 240, markers = [] }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const key = import.meta.env.VITE_MAPGL_KEY as string | undefined;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const disposables: HtmlMarkerLike[] = [];
    (async () => {
      const lib = await loadMapglLib();
      if (cancelled || !lib || !ref.current) return;

      const bounds = zones.map((z) => multiPolygonBounds(z.geometry)).find((b): b is [LngLat, LngLat] => b !== null);
      const map = new lib.Map(ref.current, {
        key,
        regionId: REGION_ID,
        center,
        zoom: bounds ? DEFAULT_ZOOM : DEFAULT_ZOOM + 4,
        style: STYLE_SCHEME,
        minZoom: 6.5,
        maxZoom: 18,
      } as Record<string, unknown>);
      mapRef.current = map;
      if (bounds) map.fitBounds(bounds, { padding: 30 });

      for (const zone of [...zones].sort((a, b) => b.durationSec - a.durationSec)) {
        const style = zoneStyle(zone.durationSec);
        const polygons = zone.geometry.coordinates as unknown as [number, number][][][];
        for (const rings of polygons) {
          disposables.push(
            new lib.Polygon(map, {
              coordinates: rings as unknown as number[][][],
              color: withAlpha(style.fill, zone.isMock ? 0.25 : 0.38),
              strokeColor: style.stroke,
              strokeWidth: zone.isMock ? 1 : 2,
              interactive: false,
            }),
          );
        }
      }

      const centerEl = makeElement(
        '<div title="Объект" style="width:16px;height:16px;border-radius:50%;background:#EF6C00;border:2px solid #fff;box-shadow:0 0 0 1px #0003;"></div>',
      );
      disposables.push(new lib.HtmlMarker(map, { coordinates: center, html: centerEl }));

      for (const m of markers) {
        const el = makeElement(
          `<div title="${m.label.replace(/"/g, '&quot;')}" style="width:12px;height:12px;border-radius:50%;` +
            `background:${m.inside ? '#D32F2F' : '#455A64'};border:2px solid #fff;box-shadow:0 0 0 1px #0003;"></div>`,
        );
        disposables.push(new lib.HtmlMarker(map, { coordinates: m.point, html: el }));
      }
    })();
    return () => {
      cancelled = true;
      for (const d of disposables) d.destroy();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, center[0], center[1], zones, markers.length]);

  if (!key) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center', bgcolor: '#eceff1', borderRadius: 1, p: 1 }}>
        <Typography variant="caption" color="text.secondary" align="center">
          Мини-карта недоступна без ключа MapGL ({center[1].toFixed(4)}, {center[0].toFixed(4)}). Числовые показатели
          отчёта доступны ниже.
        </Typography>
      </Box>
    );
  }
  return <Box ref={ref} sx={{ height, borderRadius: 1, overflow: 'hidden', bgcolor: '#eceff1' }} />;
}
