/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Публичный ключ 2ГИС MapGL (отрисовка карты в браузере). */
  readonly VITE_MAPGL_KEY?: string;
  /** Базовый путь API (по умолчанию /api/v1). */
  readonly VITE_API_BASE?: string;
  /** URL hls.js для реальных HLS-камер (для on-premise — self-host; по умолчанию CDN). */
  readonly VITE_HLS_JS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
