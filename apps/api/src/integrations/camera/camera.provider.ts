/**
 * CameraProvider (§10, §7 Ф3): камеры видеонаблюдения подрядчиков.
 * Поддержка HLS (через hls.js на фронте), снимков по расписанию (refresh_sec)
 * и статичных кадров. Обязательны: метка времени последнего кадра, состояние
 * «камера недоступна», признак полученного согласия подрядчика.
 *
 * MVP: мок — статичный кадр + псевдо-«живой» таймстемп (обновляется на клиенте).
 * Боевой этап: реальные HLS/RTSP-эндпоинты, токены, медиа-сервер (MediaMTX/nginx-rtmp),
 * чекбокс «согласие подрядчика получено» (docs/INTEGRATIONS.md).
 */

export interface CameraStream {
  id: number;
  title: string;
  type: 'hls' | 'rtsp' | 'snapshot';
  url: string;
  refreshSec: number;
  lastFrameAt: string | null;
  isActive: boolean;
  consentObtained: boolean;
  isMock: boolean;
}

export interface CameraProvider {
  readonly kind: 'mock' | 'live';
}

/**
 * В MVP список камер берётся из БД (camera_sources, засеяны моками).
 * Провайдер-заглушка фиксирует контракт; боевая реализация добавит
 * проверку живости потока и получение lastFrameAt из медиа-сервера.
 */
export class MockCameraProvider implements CameraProvider {
  readonly kind = 'mock' as const;
}

export class LiveCameraProvider implements CameraProvider {
  readonly kind = 'live' as const;
  constructor(private readonly opts: { mediaServerBaseUrl?: string; tokenRef?: string }) {}
  get mediaServerBaseUrl(): string | undefined {
    return this.opts.mediaServerBaseUrl;
  }
}

export function createCameraProvider(env: { CAMERA_PROVIDER?: string }): CameraProvider {
  return env.CAMERA_PROVIDER === 'live' ? new LiveCameraProvider({}) : new MockCameraProvider();
}
