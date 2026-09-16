import { useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import type { ObjectCamera } from '../../lib/api-client';
import { DemoBadge } from '../common/Badges';

/** Форматирование метки времени последнего кадра. */
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Минимальный тип hls.js (загружается в рантайме, не бандлится — см. docs/IMAGERY.md).
interface HlsLike {
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, cb: () => void): void;
  destroy(): void;
}
interface HlsCtor {
  new (): HlsLike;
  isSupported(): boolean;
  Events: { ERROR: string };
}
declare global {
  interface Window {
    Hls?: HlsCtor;
  }
}

let hlsLoading: Promise<HlsCtor | null> | null = null;
/**
 * Загрузка hls.js в рантайме (script-тег). URL — VITE_HLS_JS_URL (для on-premise
 * self-host) либо CDN по умолчанию. Не бандлится: нужен только для реальных
 * HLS-камер на боевом этапе, MVP работает на snapshot-заглушках.
 */
function loadHls(): Promise<HlsCtor | null> {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLoading) return hlsLoading;
  const url =
    (import.meta.env.VITE_HLS_JS_URL as string | undefined) ??
    'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
  hlsLoading = new Promise<HlsCtor | null>((resolve) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve(window.Hls ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return hlsLoading;
}

/**
 * Камера стройплощадки (§7 Ф3). MVP-заглушка: статичный кадр + псевдо-«живой»
 * таймстемп (обновляется), обязательна метка времени последнего кадра и состояние
 * «камера недоступна». Для type='hls' — подключение через hls.js (рантайм-загрузка),
 * с откатом на постер/таймстемп при недоступности потока.
 */
export function CameraFeed({ camera }: { camera: ObjectCamera }) {
  const [lastFrame, setLastFrame] = useState<Date | null>(null);
  const [imgSrc, setImgSrc] = useState(camera.url);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const refreshMs = Math.max(5, camera.refreshSec) * 1000;

  // Псевдо-«живой» таймстемп: тикает раз в refreshSec (кадр «обновляется»)
  useEffect(() => {
    if (!camera.isActive) return;
    setLastFrame(new Date());
    const t = setInterval(() => {
      setLastFrame(new Date());
      if (camera.type === 'snapshot') {
        setImgSrc(`${camera.url}${camera.url.includes('?') ? '&' : '?'}t=${Date.now()}`);
      }
    }, refreshMs);
    return () => clearInterval(t);
  }, [camera.isActive, camera.type, camera.url, refreshMs]);

  // HLS-поток (боевой режим) — рантайм-загрузка hls.js
  useEffect(() => {
    if (camera.type !== 'hls' || !camera.isActive || !videoRef.current) return;
    let destroyed = false;
    let hls: HlsLike | null = null;
    (async () => {
      const Hls = await loadHls();
      if (destroyed || !videoRef.current) return;
      if (Hls && Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(camera.url);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.ERROR, () => setError(true));
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = camera.url; // нативный HLS (Safari/iOS)
      } else {
        setError(true);
      }
    })();
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [camera.type, camera.url, camera.isActive]);

  if (!camera.isActive) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, textAlign: 'center', bgcolor: '#fafafa' }}>
        <Typography variant="body2" color="text.secondary">
          Камера недоступна
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {camera.title}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ position: 'relative', bgcolor: '#000', aspectRatio: '16 / 10' }}>
        {camera.type === 'hls' && !error ? (
          <video ref={videoRef} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Box
            component="img"
            src={imgSrc}
            alt={camera.title}
            onError={() => setError(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', bgcolor: 'rgba(0,0,0,.6)' }}>
            <Typography variant="body2">Поток недоступен (демо-режим)</Typography>
          </Box>
        )}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {camera.title}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {camera.isMock && <DemoBadge label="демо" />}
          <Typography variant="caption" color="text.secondary">
            Кадр: {lastFrame ? fmtTime(lastFrame) : '—'}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
