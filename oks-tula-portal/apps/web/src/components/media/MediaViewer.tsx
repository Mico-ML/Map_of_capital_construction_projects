import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { formatDateRu } from '@oks/shared';
import type { ObjectMedia } from '../../lib/api-client';
import { useObjectCameras, useObjectMedia, useImageryStatus } from '../../hooks/useApi';
import { DemoBadge } from '../common/Badges';
import { CameraFeed } from './CameraFeed';

type Mode = 'timeline' | 'compare' | 'camera';
type CompareMode = 'swipe' | 'side' | 'opacity' | 'toggle';

const KIND_LABEL: Record<string, string> = {
  before_sat: 'До (снимок)',
  process_photo: 'В процессе',
  process_video: 'В процессе (видео)',
  after_render: 'После (рендер)',
  camera_snapshot: 'Камера',
  document: 'Документ',
};
const KIND_COLOR: Record<string, string> = {
  before_sat: '#6D4C41',
  process_photo: '#EF6C00',
  after_render: '#2E7D32',
  camera_snapshot: '#455A64',
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <Chip
      size="small"
      label={KIND_LABEL[kind] ?? kind}
      sx={{ bgcolor: KIND_COLOR[kind] ?? '#607D8B', color: '#fff', fontWeight: 600, height: 20, fontSize: 11 }}
    />
  );
}

/** Общий кадр-контейнер (одинаковый вьюпорт для всех режимов сравнения — синхронизация, §7 Ф3). */
const FRAME_BOX = { width: '100%', aspectRatio: '16 / 10', bgcolor: '#000', position: 'relative', overflow: 'hidden', borderRadius: 1 } as const;

function FrameImage({ item, style }: { item: ObjectMedia; style?: React.CSSProperties }) {
  return (
    <Box
      component="img"
      src={item.url}
      alt={`${KIND_LABEL[item.kind] ?? item.kind}: ${item.caption ?? ''}`}
      loading="lazy"
      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
    />
  );
}

export function MediaViewer({ objectId }: { objectId: string }) {
  const { data: media, isLoading } = useObjectMedia(objectId);
  const { data: cameras } = useObjectCameras(objectId);
  const { data: imagery } = useImageryStatus();
  const reduced = usePrefersReducedMotion();

  const [mode, setMode] = useState<Mode>('timeline');
  const frames = useMemo(() => (media ?? []).slice().sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? '')), [media]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [compareMode, setCompareMode] = useState<CompareMode>('swipe');
  const [swipe, setSwipe] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [toggleState, setToggleState] = useState<'before' | 'after'>('before');

  useEffect(() => setFrameIndex(0), [objectId, frames.length]);

  // автовоспроизведение таймлайна (отключается при prefers-reduced-motion, §8)
  useEffect(() => {
    if (!playing || frames.length < 2 || reduced) return;
    const t = setInterval(() => setFrameIndex((i) => (i + 1) % frames.length), 1200);
    return () => clearInterval(t);
  }, [playing, frames.length, reduced]);

  const before = frames.find((f) => f.kind === 'before_sat') ?? frames[0];
  const after = [...frames].reverse().find((f) => f.kind === 'after_render') ?? frames[frames.length - 1];

  if (isLoading) return <CircularProgress size={24} />;

  if (!media || media.length === 0) {
    return (
      <Alert severity="info" icon={false}>
        Материалы «До / В процессе / После» для этого объекта не предоставлены. Демо-набор кадров загружен для 10
        показательных объектов (Приложение C.3). Запрос материалов у заказчика — через форму обратной связи.
        {imagery?.imagery.note ? ` ${imagery.imagery.note}` : ''}
      </Alert>
    );
  }

  const current = frames[Math.min(frameIndex, frames.length - 1)];

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v as Mode)}>
          <ToggleButton value="timeline">Хронология</ToggleButton>
          <ToggleButton value="compare">До / После</ToggleButton>
          <ToggleButton value="camera" disabled={!cameras || cameras.length === 0}>
            Камеры
          </ToggleButton>
        </ToggleButtonGroup>
        <DemoBadge label="демо-материалы" />
      </Stack>

      {mode === 'timeline' && current && (
        <Box>
          <Box sx={FRAME_BOX}>
            <FrameImage item={current} />
            <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
              <KindBadge kind={current.kind} />
            </Box>
            <Box sx={{ position: 'absolute', bottom: 8, left: 8, right: 8, color: '#fff', textShadow: '0 1px 3px #000' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {current.caption ?? KIND_LABEL[current.kind]}
              </Typography>
              <Typography variant="caption">
                {formatDateRu(current.takenAt)} · источник: {current.license ?? 'демо-данные'}
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <IconButton size="small" onClick={() => setPlaying((p) => !p)} disabled={reduced || frames.length < 2} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
              {playing ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <Slider
                size="small"
                min={0}
                max={Math.max(0, frames.length - 1)}
                step={1}
                value={Math.min(frameIndex, frames.length - 1)}
                onChange={(_, v) => {
                  setPlaying(false);
                  setFrameIndex(v as number);
                }}
                aria-label="Кадры хронологии"
                valueLabelFormat={(i) => formatDateRu(frames[i]?.takenAt) ?? ''}
                valueLabelDisplay="auto"
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {Math.min(frameIndex, frames.length - 1) + 1} / {frames.length}
            </Typography>
          </Stack>
          {reduced && (
            <Typography variant="caption" color="text.secondary">
              Автопроигрывание отключено (уважается prefers-reduced-motion).
            </Typography>
          )}

          {/* лента миниатюр */}
          <Stack direction="row" spacing={1} sx={{ mt: 1, overflowX: 'auto', pb: 0.5 }}>
            {frames.map((f, i) => (
              <Tooltip key={f.id} title={`${KIND_LABEL[f.kind]} · ${formatDateRu(f.takenAt)}`}>
                <Box
                  component="img"
                  src={f.url}
                  alt=""
                  onClick={() => {
                    setPlaying(false);
                    setFrameIndex(i);
                  }}
                  sx={{
                    width: 72,
                    height: 45,
                    objectFit: 'cover',
                    borderRadius: 0.5,
                    cursor: 'pointer',
                    border: i === frameIndex ? '2px solid' : '2px solid transparent',
                    borderColor: i === frameIndex ? 'primary.main' : 'transparent',
                    opacity: i === frameIndex ? 1 : 0.7,
                  }}
                />
              </Tooltip>
            ))}
          </Stack>
        </Box>
      )}

      {mode === 'compare' && before && after && (
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
            <ToggleButtonGroup size="small" value={compareMode} exclusive onChange={(_, v) => v && setCompareMode(v as CompareMode)}>
              <ToggleButton value="swipe">Шторка</ToggleButton>
              <ToggleButton value="side">Бок о бок</ToggleButton>
              <ToggleButton value="opacity">Наложение</ToggleButton>
              <ToggleButton value="toggle">Было/стало</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {compareMode === 'swipe' && (
            <Box>
              <Box sx={FRAME_BOX}>
                <FrameImage item={after} />
                <Box sx={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
                  <FrameImage item={before} />
                </Box>
                <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${swipe}%`, width: 2, bgcolor: '#fff', boxShadow: '0 0 4px #000' }} />
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  <KindBadge kind={before.kind} />
                </Box>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <KindBadge kind={after.kind} />
                </Box>
              </Box>
              <Slider size="small" value={swipe} onChange={(_, v) => setSwipe(v as number)} aria-label="Положение шторки" sx={{ mt: 1 }} />
            </Box>
          )}

          {compareMode === 'side' && (
            <Stack direction="row" spacing={1}>
              <Box sx={{ flex: 1 }}>
                <Box sx={FRAME_BOX}>
                  <FrameImage item={before} />
                  <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                    <KindBadge kind={before.kind} />
                  </Box>
                </Box>
                <Typography variant="caption" align="center" display="block">
                  {formatDateRu(before.takenAt)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={FRAME_BOX}>
                  <FrameImage item={after} />
                  <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                    <KindBadge kind={after.kind} />
                  </Box>
                </Box>
                <Typography variant="caption" align="center" display="block">
                  {formatDateRu(after.takenAt)}
                </Typography>
              </Box>
            </Stack>
          )}

          {compareMode === 'opacity' && (
            <Box>
              <Box sx={FRAME_BOX}>
                <FrameImage item={after} />
                <Box sx={{ position: 'absolute', inset: 0, opacity: opacity / 100 }}>
                  <FrameImage item={before} />
                </Box>
              </Box>
              <Slider size="small" value={opacity} onChange={(_, v) => setOpacity(v as number)} aria-label="Прозрачность слоя «До»" sx={{ mt: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Прозрачность слоя «До»: {opacity}%
              </Typography>
            </Box>
          )}

          {compareMode === 'toggle' && (
            <Box>
              <Box sx={FRAME_BOX}>
                <FrameImage item={toggleState === 'before' ? before : after} />
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  <KindBadge kind={(toggleState === 'before' ? before : after).kind} />
                </Box>
              </Box>
              <Button
                variant="contained"
                sx={{ mt: 1 }}
                onClick={() => setToggleState((s) => (s === 'before' ? 'after' : 'before'))}
              >
                {toggleState === 'before' ? 'Показать «После»' : 'Показать «До»'}
              </Button>
            </Box>
          )}

          {imagery?.imagery.note && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {imagery.imagery.note}
            </Typography>
          )}
        </Box>
      )}

      {mode === 'camera' && (
        <Stack spacing={1}>
          {(cameras ?? []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Камеры к объекту не подключены.
            </Typography>
          ) : (
            (cameras ?? []).map((c) => <CameraFeed key={c.id} camera={c} />)
          )}
          {imagery?.camera.note && (
            <Typography variant="caption" color="text.secondary">
              {imagery.camera.note}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}
