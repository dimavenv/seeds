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

echo "==> Перезапускаю через pm2 (reload — воркеры по одному, без простоя)..."
pm2 reload ecosystem.config.js --update-env

echo "==> Проверяю здоровье сайта..."
sleep 5
curl -fsS http://127.0.0.1:3000/api/health || true
echo
echo "Готово. Логи: pm2 logs seeds"
