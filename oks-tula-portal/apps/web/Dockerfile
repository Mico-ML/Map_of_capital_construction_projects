# ============================================================================
# Образ web (React + Vite → статика, раздаётся nginx reverse-proxy).
# Публичный ключ MapGL попадает в бандл на этапе сборки (build-arg).
# ============================================================================
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_MAPGL_KEY=""
ARG VITE_API_BASE="/api/v1"
ENV VITE_MAPGL_KEY=$VITE_MAPGL_KEY VITE_API_BASE=$VITE_API_BASE

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY etl/package.json etl/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# web импортирует @oks/shared из исходников (vite alias) — сборка shared не обязательна,
# но собираем для консистентности типов
RUN npm run build -w @oks/shared && npm run build -w @oks/web

# --- Рантайм: nginx ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
