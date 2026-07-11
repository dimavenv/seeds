#!/usr/bin/env bash
# Обновление сайта на VPS: подтянуть свежий код, пересобрать и перезапустить.
# Запуск из корня проекта или откуда угодно: bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Получаю свежий код из git..."
git pull

echo "==> Пересобираю и перезапускаю контейнер..."
docker compose up -d --build web

echo "==> Убираю старые образы..."
docker image prune -f >/dev/null

echo "==> Проверяю здоровье сайта..."
sleep 5
curl -fsS http://127.0.0.1:3000/api/health || true
echo
echo "Готово. Логи: docker compose logs -f web"
