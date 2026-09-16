#!/bin/sh
# Entrypoint контейнера API: ожидание БД → миграции → ETL dry-run (отчёт) → сид → запуск.
# Всё идемпотентно; повторный запуск не создаёт дубли (§6.1 п.10).
set -e

PRISMA_BIN="./node_modules/.bin/prisma"

echo "[entrypoint] ожидание готовности PostgreSQL/PostGIS…"
i=0
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1)).finally(()=>p.\$disconnect());
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] БД не готова за отведённое время — запуск без сида (health покажет degraded)";
    break
  fi
  sleep 2
done

if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  echo "[entrypoint] применение миграций (prisma migrate deploy)…"
  "$PRISMA_BIN" migrate deploy --schema apps/api/prisma/schema.prisma \
    || echo "[entrypoint] миграции не применены — см. логи"
fi

if [ "$RUN_SEED_ON_START" = "true" ]; then
  echo "[entrypoint] ETL: отчёт о качестве данных…"
  node etl/dist/dry_run.js || echo "[entrypoint] etl dry-run завершился с ошибкой (не критично для старта)"
  echo "[entrypoint] сидирование БД (реестр + МО + справочники + мок-данные)…"
  node apps/api/dist/seed/seed.js || echo "[entrypoint] сид завершился ошибкой — см. логи"
fi

echo "[entrypoint] запуск API…"
exec "$@"
