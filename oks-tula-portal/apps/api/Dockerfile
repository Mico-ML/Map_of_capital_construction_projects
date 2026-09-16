# ============================================================================
# Образ API (NestJS). Multi-stage: сборка TS → рантайм на node:20-alpine.
# Контекст сборки — корень монорепозитория (npm workspaces).
# ============================================================================
FROM node:20-alpine AS build
WORKDIR /app

# Копируем манифесты всех воркспейсов для установки зависимостей
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY etl/package.json etl/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# Копируем исходники и собираем shared → etl → api (+ prisma generate)
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY etl etl
COPY apps/api apps/api
RUN npm run build -w @oks/shared \
 && npm run build -w @oks/etl \
 && npm run build -w @oks/api

# --- Рантайм ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY etl/package.json etl/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# производственные зависимости (prisma CLI включён — нужен для migrate deploy)
RUN npm ci --omit=dev --no-audit --no-fund

# сгенерированный prisma-клиент и собранный код (shared → etl → api, включая seed)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/etl/dist ./etl/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY data ./data
COPY reports ./reports
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /var/data/media
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=60s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
