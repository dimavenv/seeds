#!/usr/bin/env bash
# Обновление сайта на VPS: свежий код → сборка → перезапуск без простоя.
# Запуск: bash deploy/update.sh (из любого места)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Получаю свежий код из git..."
git pull

echo "==> Ставлю зависимости и собираю..."
npm ci
npm run build

# standalone-сборка не включает статику и public — докопируем
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# Жёсткий перезапуск: pm2 reload НЕ обновляет переменные окружения работающих
# воркеров (проверено: пароль банка оставался старым после reload --update-env).
# Пара секунд простоя — зато .env.production гарантированно перечитан.
echo "==> Перезапускаю через pm2 (жёстко, чтобы перечитался .env.production)..."
pm2 delete seeds 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save >/dev/null 2>&1 || true

echo "==> Проверяю здоровье сайта..."
sleep 5
curl -fsS http://127.0.0.1:3000/api/health || true
echo
echo "Готово. Логи: pm2 logs seeds"
