import { Box, Divider, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { IsochroneDirection, IsochroneZone, StatusGroupCode } from '@oks/shared';
import { DIRECTION_LABELS, INDUSTRY_ICON_SHAPES, INDUSTRIES, STATUS_GROUPS, zoneStyle } from '@oks/shared';

const GROUP_ORDER: StatusGroupCode[] = ['design', 'construction', 'procurement', 'completed'];
const GROUP_SYMBOL: Record<StatusGroupCode, string> = {
  design: '◱',
  construction: '▲',
  procurement: '◆',
  completed: '●',
};

function shapeSvg(shape: string, size = 14) {
  const paths: Record<string, string> = {
    square: 'M3 3h8v8H3z',
    circle: 'M7 1a6 6 0 1 0 0 12A6 6 0 0 0 7 1z',
    triangle: 'M7 1 13 13H1z',
    diamond: 'M7 1l6 6-6 6-6-6z',
    hexagon: 'M7 1l5 3v6l-5 3-5-3V4z',
    star: 'M7 1l1.8 3.9L13 5.5 10 8.3l.9 4.4L7 10.5 3.1 12.7 4 8.3 1 5.5l4.2-.6z',
    cross: 'M5 1h4v4h4v4H9v4H5V9H1V5h4z',
    pentagon: 'M7 1l6 4.5-2.3 7H4.3L2 5.5z',
    shield: 'M7 1l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V3z',
    drop: 'M7 1s4.5 5 4.5 7.5a4.5 4.5 0 1 1-9 0C2.5 6 7 1 7 1z',
    octagon: 'M5 1h4l3 3v4l-3 3H5L2 8V4z',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d={paths[shape] ?? paths.octagon} fill="#607D8B" />
    </svg>
  );
}

interface LegendProps {
  /** Зоны пешей доступности (Ф4) — при их наличии легенда дополняется градацией времени. */
  isoZones?: IsochroneZone[];
  isoDirection?: IsochroneDirection;
  isoMock?: boolean;
}

/** Легенда карты: статусы (цвет+символ), отрасли (форма), приближённое положение, изохроны (§8). */
export function MapLegend({ isoZones = [], isoDirection = 'from', isoMock = false }: LegendProps) {
  return (
    <Paper sx={{ p: 1.5, maxWidth: 260, fontSize: 12, maxHeight: '60vh', overflowY: 'auto' }} elevation={3}>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        Статус объекта
      </Typography>
      <Stack spacing={0.25} sx={{ my: 0.5 }}>
        {GROUP_ORDER.map((g) => (
          <Stack key={g} direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: STATUS_GROUPS[g].colorHex, border: '1px solid #fff', boxShadow: '0 0 0 1px #0002' }} />
            <Typography variant="caption">
              {GROUP_SYMBOL[g]} {STATUS_GROUPS[g].label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        Отрасль (форма значка)
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, my: 0.5 }}>
        {INDUSTRIES.filter((i) => i.code !== 'other').map((i) => (
          <Tooltip key={i.code} title={i.name}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {shapeSvg(INDUSTRY_ICON_SHAPES[i.code] ?? 'octagon')}
            </Stack>
          </Tooltip>
        ))}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
        <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#BDBDBD', border: '2px dashed #757575' }} />
        <Typography variant="caption">местоположение уточняется</Typography>
      </Stack>
      {isoZones.length > 0 && (
        <>
          <Divider sx={{ my: 0.75 }} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Зона пешей доступности
          </Typography>
          <Stack spacing={0.25} sx={{ my: 0.5 }}>
            {[...isoZones]
              .sort((a, b) => a.durationSec - b.durationSec)
              .map((zone) => {
                const style = zoneStyle(zone.durationSec);
                return (
                  <Stack key={zone.durationSec} direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '3px',
                        bgcolor: style.fill,
                        opacity: zone.isMock ? 0.6 : 0.9,
                        border: `2px ${zone.isMock ? 'dashed' : 'solid'} ${style.stroke}`,
                      }}
                    />
                    <Typography variant="caption">{style.label}</Typography>
                  </Stack>
                );
              })}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Направление: {DIRECTION_LABELS[isoDirection].title.toLowerCase()}
            {isoMock ? ' · ДЕМО-МОДЕЛЬ (не пешеходная сеть 2ГИС)' : ' · расчёт по пешеходной сети 2ГИС'}
          </Typography>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Полный список отраслей — в фильтре слева. Картооснова — 2ГИС.
      </Typography>
    </Paper>
  );
}
