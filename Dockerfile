# ── StatusDEV API — multi-stage Docker build ──
# Оптимізовано для Railway / Render: маленький образ, міграції при старті.

# 1. Base: встановлюємо залежності
FROM node:24-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY web/package.json web/

RUN npm ci --ignore-scripts

# 2. Build: збираємо shared → api
FROM base AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY api/ api/

RUN npm run build --workspace=@statusdev/shared
RUN npm run build --workspace=@statusdev/api

# 3. Production: тільки те, що потрібно для запуску
FROM node:24-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY web/package.json web/

RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Скомпільований shared
COPY --from=build /app/shared/dist/ shared/dist/
COPY --from=build /app/shared/package.json shared/package.json

# Скомпільований API + drizzle міграції
COPY --from=build /app/api/dist/ api/dist/
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/drizzle/ api/drizzle/
COPY --from=build /app/api/drizzle.config.ts api/drizzle.config.ts

# Скрипт старту
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
