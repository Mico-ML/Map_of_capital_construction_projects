import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import type { GeoJsonFeatureCollection, IsochroneZone, LngLat, ObjectSummary, StatusGroupCode } from '@oks/shared';
import {
  REGION_BOUNDS,
  REGION_ID,
  TULA_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  CLUSTER_MAX_ZOOM,
  STATUS_GROUP_COLORS,
  INDUSTRY_ICON_SHAPES,
  spreadCoincidentPoint,
  zoneStyle,
} from '@oks/shared';
import {
  loadMapglLib,
  makeElement,
  withAlpha,
  type MapLike,
  type MapglLib,
  type HtmlMarkerLike,
} from '../../lib/mapgl-loader';

// Стиль 2ГИС «схема» (styles.2gis.com). «Спутник» недоступен без отдельной подписки (§4.5).
const STYLE_SCHEME = 'c080bb6a-a2ec-4a63-a4c8-6e2c1a9a4a92';

/** Слой покрытия/«белых пятен» пакетного режима Ф4. */
export interface CoverageLayer {
  coverage: GeoJsonFeatureCollection | null;
  whiteSpots: GeoJsonFeatureCollection | null;
}

interface MapViewProps {
  objects: ObjectSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Зоны пешей доступности выбранного объекта (Ф4). */
  zones?: IsochroneZone[];
  /** Показывать ли зоны (переключатель слоя). */
  zonesVisible?: boolean;
  /** Сводное покрытие и «белые пятна» (пакетный режим Ф4). */
  coverageLayer?: CoverageLayer | null;
  /** При изменении `nonce` карта вписывает зоны/покрытие во вьюпорт. */
  focus?: { bounds: [LngLat, LngLat]; nonce: number } | null;
}

const CLUSTER_CELL_PX = 56;
const IDENTICAL_EPS = 1e-4;

function shapePath(shape: string): string {
  switch (shape) {
    case 'circle':
      return 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z';
    case 'triangle':
      return 'M12 3 22 21H2z';
    case 'diamond':
      return 'M12 2 22 12 12 22 2 12z';
    case 'hexagon':
      return 'M12 2 21 7v10l-9 5-9-5V7z';
    case 'star':
      return 'M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17l-6.1 3.4 1.4-6.8L2.2 9l6.9-.7z';
    case 'cross':
      return 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z';
    case 'pentagon':
      return 'M12 2l9.5 7-3.6 11H6.1L2.5 9z';
    case 'shield':
      return 'M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z';
    case 'drop':
      return 'M12 2s7 8 7 12a7 7 0 1 1-14 0c0-4 7-12 7-12z';
    case 'octagon':
      return 'M8 2h8l6 6v8l-6 6H8l-6-6V8z';
    case 'square':
    default:
      return 'M4 4h16v16H4z';
  }
}

function objectMarkerHtml(o: ObjectSummary): string {
  const color = STATUS_GROUP_COLORS[(o.statusGroup ?? 'completed') as StatusGroupCode];
  const shape = INDUSTRY_ICON_SHAPES[o.industryCode ?? 'other'] ?? 'octagon';
  const title = `${o.name}${o.municipalityName ? ` — ${o.municipalityName}` : ''}${o.locationApproximate ? ' (местоположение уточняется)' : ''}`;
  return (
    `<div title="${title.replace(/"/g, '&quot;')}" style="cursor:pointer;width:26px;height:26px;display:grid;place-items:center;">` +
    `<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.4));">` +
    `<path d="${shapePath(shape)}" fill="${o.locationApproximate ? '#BDBDBD' : color}" stroke="${o.locationApproximate ? '#757575' : '#fff'}" stroke-width="${o.locationApproximate ? 2 : 1}" ${o.locationApproximate ? 'stroke-dasharray="3 2"' : ''}/>` +
    `</svg></div>`
  );
}

function clusterHtml(count: number): string {
  const size = count > 99 ? 40 : count > 9 ? 34 : 28;
  return (
    `<div title="Здесь несколько объектов: ${count}" style="cursor:pointer;width:${size}px;height:${size}px;border-radius:50%;` +
    `background:#1565C0;color:#fff;border:2px solid #fff;display:grid;place-items:center;font:700 13px sans-serif;` +
    `box-shadow:0 1px 3px rgba(0,0,0,.4);">${count}</div>`
  );
}

export function MapView({ objects, selectedId, onSelect, zones, zonesVisible = true, coverageLayer, focus }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const mapglRef = useRef<MapglLib | null>(null);
  const markersRef = useRef<HtmlMarkerLike[]>([]);
  const zonePolygonsRef = useRef<HtmlMarkerLike[]>([]);
  const coveragePolygonsRef = useRef<HtmlMarkerLike[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-key' | 'error'>('loading');
  const [basemap, setBasemap] = useState<'scheme' | 'satellite'>('scheme');
  const satelliteAvailable = false; // «спутник» требует отдельной подписки 2ГИС (§4.5)

  const key = import.meta.env.VITE_MAPGL_KEY as string | undefined;
  const dataRef = useRef({ objects, selectedId, onSelect });
  dataRef.current = { objects, selectedId, onSelect };

  // Инициализация карты — один раз
  useEffect(() => {
    if (!key) {
      setStatus('no-key');
      return;
    }
    let cancelled = false;
    (async () => {
      const lib = await loadMapglLib();
      if (cancelled || !containerRef.current) return;
      if (!lib) {
        setStatus('error');
        return;
      }
      try {
        mapglRef.current = lib;
        const map = new lib.Map(containerRef.current, {
          key,
          regionId: REGION_ID,
          center: TULA_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          maxBounds: REGION_BOUNDS,
          style: STYLE_SCHEME,
        });
        mapRef.current = map;
        new lib.ZoomControl(map, { position: 'topRight' });
        new lib.ScaleControl(map, { position: 'bottomRight' });
        const compass = new lib.Control(
          map,
          '<button title="Ориентировать на север" aria-label="Ориентировать на север" style="width:34px;height:34px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer;font:16px sans-serif;">\u2191</button>',
          { position: 'topRight' },
        );
        (compass as unknown as { getContainer?: () => HTMLElement }).getContainer?.()
          .querySelector('button')
          ?.addEventListener('click', () => map.setRotation(0));

        map.on('moveend', () => drawMarkers());
        map.on('zoomend', () => drawMarkers());
        setStatus('ready');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Не удалось инициализировать карту 2ГИС', err);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      for (const p of zonePolygonsRef.current) p.destroy();
      for (const p of coveragePolygonsRef.current) p.destroy();
      zonePolygonsRef.current = [];
      coveragePolygonsRef.current = [];
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (status === 'ready') drawMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, selectedId, status]);

  // Зоны пешей доступности (Ф4): полупрозрачные полигоны с градацией по времени
  useEffect(() => {
    if (status !== 'ready') return;
    drawZonePolygons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, zonesVisible, status]);

  // Сводное покрытие и «белые пятна» (пакетный режим Ф4)
  useEffect(() => {
    if (status !== 'ready') return;
    drawCoveragePolygons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageLayer, status]);

  // Вписать зону/покрытие во вьюпорт по явному действию пользователя
  useEffect(() => {
    if (status !== 'ready' || !focus) return;
    mapRef.current?.fitBounds(focus.bounds, { padding: 80 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, status]);

  /** Зоны доступности: большие длительности рисуем первыми (меньшие — поверх). */
  function drawZonePolygons() {
    const map = mapRef.current;
    const lib = mapglRef.current;
    for (const p of zonePolygonsRef.current) p.destroy();
    zonePolygonsRef.current = [];
    if (!map || !lib || !zonesVisible || !zones || zones.length === 0) return;

    const ordered = [...zones].sort((a, b) => b.durationSec - a.durationSec);
    ordered.forEach((zone, zoneIndex) => {
      const style = zoneStyle(zone.durationSec);
      const polygons = zone.geometry.coordinates as unknown as [number, number][][][];
      polygons.forEach((rings) => {
        zonePolygonsRef.current.push(
          new lib.Polygon(map, {
            coordinates: rings as unknown as number[][][],
            // демо-зона — штрихованная рамка и более бледная заливка (не только цветом, §8)
            color: withAlpha(style.fill, zone.isMock ? 0.22 : 0.35),
            strokeColor: style.stroke,
            strokeWidth: zone.isMock ? 1 : 2,
            zIndex: 100 + zoneIndex,
            interactive: false,
          }),
        );
      });
    });
  }

  /** Покрытие территории и «белые пятна» по МО. */
  function drawCoveragePolygons() {
    const map = mapRef.current;
    const lib = mapglRef.current;
    for (const p of coveragePolygonsRef.current) p.destroy();
    coveragePolygonsRef.current = [];
    if (!map || !lib || !coverageLayer) return;

    const addFeatures = (fc: GeoJsonFeatureCollection | null, fill: string, stroke: string, zIndex: number) => {
      if (!fc) return;
      for (const feature of fc.features) {
        const ringsList =
          feature.geometry.type === 'MultiPolygon'
            ? (feature.geometry.coordinates as unknown as [number, number][][][])
            : feature.geometry.type === 'Polygon'
              ? [feature.geometry.coordinates as unknown as [number, number][][]]
              : [];
        for (const rings of ringsList) {
          coveragePolygonsRef.current.push(
            new lib.Polygon(map, {
              coordinates: rings as unknown as number[][][],
              color: withAlpha(fill, 0.25),
              strokeColor: stroke,
              strokeWidth: 1,
              zIndex,
              interactive: false,
            }),
          );
        }
      }
    };
    addFeatures(coverageLayer.coverage, '#2E7D32', '#1B5E20', 50);
    addFeatures(coverageLayer.whiteSpots, '#D32F2F', '#B71C1C', 60);
  }

  function clearMarkers() {
    for (const m of markersRef.current) m.destroy();
    markersRef.current = [];
  }

  function drawMarkers() {
    const map = mapRef.current;
    const lib = mapglRef.current;
    if (!map || !lib) return;
    const objs = dataRef.current.objects;
    clearMarkers();
    const zoom = map.getZoom();
    const withPoint = objs.filter((o): o is ObjectSummary & { displayPoint: LngLat } => Boolean(o.displayPoint));

    const cells = new Map<string, (ObjectSummary & { displayPoint: LngLat })[]>();
    for (const o of withPoint) {
      const px = map.project([o.displayPoint[0], o.displayPoint[1]]);
      const cellKey = `${Math.floor(px[0] / CLUSTER_CELL_PX)}:${Math.floor(px[1] / CLUSTER_CELL_PX)}`;
      const arr = cells.get(cellKey);
      if (arr) arr.push(o);
      else cells.set(cellKey, [o]);
    }

    for (const group of cells.values()) {
      if (group.length === 1) {
        addSingleMarker(group[0]);
      } else if (isIdentical(group) && zoom >= CLUSTER_MAX_ZOOM) {
        group.forEach((o, i) => addSingleMarker(o, spreadCoincidentPoint(o.displayPoint, i, group.length)));
      } else {
        addClusterMarker(group);
      }
    }
  }

  function addSingleMarker(o: ObjectSummary & { displayPoint: LngLat }, overrideCoord?: LngLat) {
    const map = mapRef.current;
    const lib = mapglRef.current;
    if (!map || !lib) return;
    const el = makeElement(objectMarkerHtml(o));
    if (o.id === dataRef.current.selectedId) el.style.transform = 'scale(1.25)';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      dataRef.current.onSelect(o.id);
    });
    markersRef.current.push(new lib.HtmlMarker(map, { coordinates: overrideCoord ?? o.displayPoint, html: el }));
  }

  function addClusterMarker(group: (ObjectSummary & { displayPoint: LngLat })[]) {
    const map = mapRef.current;
    const lib = mapglRef.current;
    if (!map || !lib) return;
    const lon = group.reduce((s, o) => s + o.displayPoint[0], 0) / group.length;
    const lat = group.reduce((s, o) => s + o.displayPoint[1], 0) / group.length;
    const el = makeElement(clusterHtml(group.length));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const minLon = Math.min(...group.map((o) => o.displayPoint[0]));
      const maxLon = Math.max(...group.map((o) => o.displayPoint[0]));
      const minLat = Math.min(...group.map((o) => o.displayPoint[1]));
      const maxLat = Math.max(...group.map((o) => o.displayPoint[1]));
      if (maxLon - minLon < 1e-6 && maxLat - minLat < 1e-6) {
        map.setCenter([lon, lat]);
        map.setZoom(MAX_ZOOM);
      } else {
        map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60 });
      }
    });
    markersRef.current.push(new lib.HtmlMarker(map, { coordinates: [lon, lat], html: el }));
  }

  function isIdentical(group: (ObjectSummary & { displayPoint: LngLat })[]): boolean {
    const first = group[0];
    return group.every(
      (o) => Math.abs(o.displayPoint[0] - first.displayPoint[0]) < IDENTICAL_EPS && Math.abs(o.displayPoint[1] - first.displayPoint[1]) < IDENTICAL_EPS,
    );
  }

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setCenter([pos.coords.longitude, pos.coords.latitude]);
        mapRef.current?.setZoom(13);
      },
      () => undefined,
    );
  };

  if (status === 'no-key') return <MapPlaceholder reason="no-key" />;
  if (status === 'error') return <MapPlaceholder reason="error" />;

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 400 }}>
      <Box ref={containerRef} sx={{ width: '100%', height: '100%', minHeight: 400 }} />
      <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 5, display: 'flex', gap: 0.5 }}>
        <Paper sx={{ px: 1, py: 0.5, display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <BaseMapButton active={basemap === 'scheme'} onClick={() => setBasemap('scheme')} label="Схема" />
          <BaseMapButton
            active={basemap === 'satellite'}
            disabled={!satelliteAvailable}
            onClick={() => setBasemap('satellite')}
            label="Спутник"
            title="Спутниковая подложка 2ГИС недоступна на текущей подписке (§4.5)"
          />
          <BaseMapButton active={false} onClick={locateMe} label="📍 Мне" title="Моё местоположение (требуется разрешение)" />
        </Paper>
      </Box>
      {status === 'loading' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.6)', zIndex: 4 }}>
          <Typography>Загрузка карты 2ГИС…</Typography>
        </Box>
      )}
    </Box>
  );
}

function BaseMapButton({
  active,
  disabled,
  onClick,
  label,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? 'primary.main' : 'transparent',
        color: active ? '#fff' : disabled ? 'text.disabled' : 'text.primary',
        borderRadius: 1,
        px: 1,
        py: 0.25,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: 30,
      }}
    >
      {label}
    </Box>
  );
}

function MapPlaceholder({ reason }: { reason: 'no-key' | 'error' }) {
  return (
    <Paper sx={{ p: 3, height: '100%', minHeight: 400, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Box sx={{ maxWidth: 520 }}>
        <Typography variant="h6" gutterBottom>
          {reason === 'no-key' ? 'Карта недоступна: не задан ключ 2ГИС MapGL' : 'Не удалось загрузить карту 2ГИС'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {reason === 'no-key' ? (
            <>
              Получите бесплатный демо-ключ на{' '}
              <a href="https://platform.2gis.ru" target="_blank" rel="noreferrer">
                platform.2gis.ru
              </a>{' '}
              и укажите его в <code>VITE_MAPGL_KEY</code> (файл <code>.env.local</code>), затем пересоберите web.
              Домен-ограничения ключа задаются в кабинете 2ГИС.
            </>
          ) : (
            'Проверьте подключение и значение VITE_MAPGL_KEY. Данные доступны в виде списка слева (работа без карты).'
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Список и карточки объектов работают без карты (graceful degradation, §9).
        </Typography>
      </Box>
    </Paper>
  );
}
