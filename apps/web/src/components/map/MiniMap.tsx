import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import type { LngLat } from '@oks/shared';
import { REGION_ID, DEFAULT_ZOOM } from '@oks/shared';
import { loadMapglLib, makeElement, type MapLike } from '../../lib/mapgl-loader';

const STYLE_SCHEME = 'c080bb6a-a2ec-4a63-a4c8-6e2c1a9a4a92';

/** Компактная карта с одной меткой — для режима сравнения объектов (§7 Ф1). */
export function MiniMap({ center, height = 120 }: { center: LngLat | null; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const key = import.meta.env.VITE_MAPGL_KEY as string | undefined;

  useEffect(() => {
    if (!key || !center) return;
    let cancelled = false;
    (async () => {
      const lib = await loadMapglLib();
      if (cancelled || !lib || !ref.current) return;
      const map = new lib.Map(ref.current, {
        key,
        regionId: REGION_ID,
        center,
        zoom: DEFAULT_ZOOM + 3,
        style: STYLE_SCHEME,
        interactive: false,
      } as Record<string, unknown>);
      mapRef.current = map;
      const el = makeElement(
        '<div style="width:16px;height:16px;border-radius:50%;background:#EF6C00;border:2px solid #fff;box-shadow:0 0 0 1px #0003;"></div>',
      );
      new lib.HtmlMarker(map, { coordinates: center, html: el });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, center?.[0], center?.[1]]);

  if (!key) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center', bgcolor: '#eceff1', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {center ? `${center[1].toFixed(4)}, ${center[0].toFixed(4)}` : 'нет геометрии'}
        </Typography>
      </Box>
    );
  }
  return <Box ref={ref} sx={{ height, borderRadius: 1, overflow: 'hidden', bgcolor: '#eceff1' }} />;
}
