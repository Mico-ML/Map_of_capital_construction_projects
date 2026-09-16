import pinoHttp from 'pino-http';

/**
 * Структурное логирование запросов (pino-http). Секреты и ПДн не логируются:
 * redact исключает ключи 2ГИС, авторизацию и содержимое жалоб (§9, §15.5).
 */
export function requestLogger(level: string) {
  return pinoHttp({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.key',
        'key',
        'apiKey',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
