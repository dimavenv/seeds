# Сборка и запуск магазина в Docker на VPS. Пошаговая инструкция — SETUP-VPS-RU.md.
#
# Переменные NEXT_PUBLIC_* вшиваются в клиентский код НА ЭТАПЕ СБОРКИ, поэтому
# передаются как build-аргументы (docker-compose.yml берёт их из файла .env).
# После изменения этих переменных образ нужно пересобрать: docker compose up -d --build

# --- Этап 1: зависимости ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Этап 2: сборка ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_DADATA_TOKEN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_DADATA_TOKEN=$NEXT_PUBLIC_DADATA_TOKEN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Этап 3: рантайм ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Запуск не от root
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
