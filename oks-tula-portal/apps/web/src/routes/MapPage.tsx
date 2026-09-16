import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ViewListIcon from '@mui/icons-material/ViewList';
import TableViewIcon from '@mui/icons-material/TableView';
import { useSearchParams } from 'react-router-dom';
import { multiPolygonBounds, type LngLat } from '@oks/shared';
import { api } from '../lib/api-client';
import { filtersToParams, paramsToFilters } from '../lib/filters-url';
import { useObjectIsochrone, useObjects } from '../hooks/useApi';
import { useUiStore } from '../store/ui';
import { FilterPanel } from '../components/objects/FilterPanel';
import { ObjectList } from '../components/objects/ObjectList';
import { ObjectTable } from '../components/objects/ObjectTable';
import { ObjectCard } from '../components/objects/ObjectCard';
import { MapView } from '../components/map/MapView';
import { MapLegend } from '../components/map/MapLegend';
import { ComparisonPanel } from '../components/objects/ComparisonPanel';

/**
 * Главная рабочая страница (§7 Ф1): карта в центре, фильтры и список/таблица слева,
 * карточка объекта — панель справа (не модалка). Deep linking: фильтры и выбранный
 * объект — в query-параметрах (ссылку можно отправить/распечатать).
 */
export function MapPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const filters = useUiStore((s) => s.filters);
  const selectedId = useUiStore((s) => s.selectedObjectId);
  const selectObject = useUiStore((s) => s.selectObject);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const replaceFilters = useUiStore((s) => s.replaceFilters);
  const compareIds = useUiStore((s) => s.compareIds);
  const clearCompare = useUiStore((s) => s.clearCompare);
  // Ф4: слой зон пешей доступности выбранного объекта
  const isoDurations = useUiStore((s) => s.isoDurations);
  const isoReverse = useUiStore((s) => s.isoReverse);
  const isoApproximate = useUiStore((s) => s.isoApproximate);
  const isoVisible = useUiStore((s) => s.isoVisible);
  const [mapFocus, setMapFocus] = useState<{ bounds: [LngLat, LngLat]; nonce: number } | null>(null);
  const focusNonce = useRef(0);

  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isFetching } = useObjects(filters);
  const initialized = useRef(false);

  // 1) при загрузке и при навигации по истории — читаем состояние из URL
  useEffect(() => {
    const next = paramsToFilters(searchParams);
    replaceFilters(next);
    const sel = searchParams.get('selected');
    selectObject(sel);
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 2) при изменении фильтров/выбора — пишем в URL (replace, без записи в историю)
  useEffect(() => {
    if (!initialized.current) return;
    const params = filtersToParams(filters);
    if (selectedId) params.set('selected', selectedId);
    // сравниваем с текущим URL, чтобы не плодить циклы
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, selectedId]);

  const objects = data?.items ?? [];
  const total = data?.total ?? 0;
  const withoutExact = objects.filter((o) => o.locationApproximate).length;

  // Зоны доступности: тот же ключ запроса, что и в панели карточки (дедупликация TanStack Query)
  const { data: isoData } = useObjectIsochrone({
    objectId: selectedId,
    durations: isoDurations,
    reverse: isoReverse,
    allowApproximate: isoApproximate,
    enabled: Boolean(selectedId) && isoVisible && isoDurations.length > 0,
  });
  const zones = isoVisible ? (isoData?.zones ?? []) : [];

  const fitToZones = useCallback(() => {
    const list = isoData?.zones ?? [];
    const bounds = list.map((z) => multiPolygonBounds(z.geometry)).find((b): b is [LngLat, LngLat] => b !== null);
    if (!bounds) return;
    focusNonce.current += 1;
    setMapFocus({ bounds, nonce: focusNonce.current });
  }, [isoData]);

  // При первом построении зон — вписываем их во вьюпорт (без автозума при каждом обновлении)
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isoData || isoData.zones.length === 0) return;
    const key = `${isoData.objectId}|${isoData.zones.map((z) => z.durationSec).join(',')}|${isoData.reverse}`;
    if (fittedKey.current === key) return;
    fittedKey.current = key;
    fitToZones();
  }, [isoData, fitToZones]);

  const exportButtons = (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }} useFlexGap>
      {(['csv', 'xlsx', 'geojson'] as const).map((fmt) => (
        <Button
          key={fmt}
          size="small"
          variant="outlined"
          href={api.exportUrl(fmt, filters)}
          download
          sx={{ minWidth: 0, px: 1, fontSize: 12 }}
        >
          {fmt.toUpperCase()}
        </Button>
      ))}
    </Stack>
  );

  const listPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2, pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v as 'map' | 'table')}
          aria-label="Режим просмотра"
        >
          <ToggleButton value="map" aria-label="Список">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="table" aria-label="Таблица">
            <TableViewIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Экспорт текущей выборки (с учётом фильтров)">
          <Box>{exportButtons}</Box>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {viewMode === 'table' ? (
          <ObjectTable objects={objects} total={total} selectedId={selectedId} onSelect={selectObject} loading={isFetching} />
        ) : (
          <ObjectList
            objects={objects}
            total={total}
            selectedId={selectedId}
            onSelect={selectObject}
            loading={isFetching}
            withoutExactLocation={withoutExact}
          />
        )}
      </Box>
    </Box>
  );

  const card = selectedId ? <ObjectCard id={selectedId} embedded onFocusIso={fitToZones} /> : null;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: isDesktop ? 'row' : 'column', minHeight: 0 }}>
      {isDesktop ? (
        <>
          <Paper
            square
            elevation={0}
            sx={{ width: 340, display: 'flex', flexDirection: 'column', borderRight: 1, borderColor: 'divider', maxHeight: 'calc(100vh - 64px)' }}
          >
            <Box sx={{ borderBottom: 1, borderColor: 'divider', maxHeight: '48%', overflowY: 'auto' }}>
              <FilterPanel />
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>{listPanel}</Box>
          </Paper>

          <Box sx={{ flex: 1, position: 'relative', minHeight: 'calc(100vh - 64px)' }}>
            <MapView
              objects={objects}
              selectedId={selectedId}
              onSelect={selectObject}
              zones={zones}
              zonesVisible={isoVisible}
              focus={mapFocus}
            />
            <Box sx={{ position: 'absolute', bottom: 16, left: 16, zIndex: 5 }}>
              <MapLegend isoZones={zones} isoDirection={isoReverse ? 'to' : 'from'} isoMock={Boolean(isoData?.isMock)} />
            </Box>
          </Box>

          {selectedId && (
            <Paper
              square
              elevation={4}
              sx={{ width: 420, borderLeft: 1, borderColor: 'divider', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', position: 'relative' }}
            >
              <IconButton
                aria-label="Закрыть карточку"
                onClick={() => selectObject(null)}
                sx={{ position: 'sticky', top: 8, ml: 'auto', mr: 1, display: 'flex', bgcolor: 'background.paper', zIndex: 2 }}
              >
                <CloseIcon />
              </IconButton>
              {card}
            </Paper>
          )}
        </>
      ) : (
        <>
          <Box sx={{ height: '50vh', minHeight: 320, position: 'relative' }}>
            <MapView
              objects={objects}
              selectedId={selectedId}
              onSelect={selectObject}
              zones={zones}
              zonesVisible={isoVisible}
              focus={mapFocus}
            />
            <Box sx={{ position: 'absolute', bottom: 12, left: 12, zIndex: 5 }}>
              <MapLegend isoZones={zones} isoDirection={isoReverse ? 'to' : 'from'} isoMock={Boolean(isoData?.isMock)} />
            </Box>
          </Box>
          <Paper square elevation={0} sx={{ maxHeight: '32vh', overflowY: 'auto', borderBottom: 1, borderColor: 'divider' }}>
            <FilterPanel />
          </Paper>
          <Box sx={{ flex: 1, minHeight: 240 }}>{listPanel}</Box>
          <Drawer anchor="bottom" open={Boolean(selectedId)} onClose={() => selectObject(null)} PaperProps={{ sx: { maxHeight: '82vh' } }}>
            <Box sx={{ p: 1 }}>
              <IconButton aria-label="Закрыть" onClick={() => selectObject(null)} sx={{ display: 'block', ml: 'auto' }}>
                <CloseIcon />
              </IconButton>
              {card}
            </Box>
          </Drawer>
        </>
      )}

      {/* Режим сравнения объектов (до 3) — §7 Ф1 */}
      <Drawer anchor="bottom" open={compareIds.length > 0} onClose={clearCompare} PaperProps={{ sx: { maxHeight: '80vh' } }}>
        <ComparisonPanel ids={compareIds} onClose={clearCompare} />
      </Drawer>

      {withoutExact > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', bottom: 4, right: 12, opacity: 0.7 }}>
          Без точного местоположения: {withoutExact}
        </Typography>
      )}
    </Box>
  );
}
