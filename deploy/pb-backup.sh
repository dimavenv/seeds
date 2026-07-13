#!/usr/bin/env bash
# Бэкап PocketBase: целостная копия SQLite + архив всей папки pb_data (с файлами
# фото). Хранит последние 14 дней. Подключение по расписанию — SETUP-DB-RU.md:
#   sudo crontab -e   →   0 3 * * * /opt/pocketbase/pb-backup.sh
set -euo pipefail

PB_DATA=/opt/pocketbase/pb_data
DIR=/opt/pocketbase/backups
TS=$(date +%F_%H%M)

mkdir -p "$DIR"

# Целостный снимок базы даже под нагрузкой (sqlite3 .backup)
sqlite3 "$PB_DATA/data.db" ".backup '$DIR/data_$TS.db'"

# Полный архив pb_data: база + загруженные файлы (фото товаров)
tar czf "$DIR/pb_data_$TS.tar.gz" -C "$(dirname "$PB_DATA")" "$(basename "$PB_DATA")"

# Чистим старше 14 дней
find "$DIR" -type f -mtime +14 -delete

echo "OK: $DIR/pb_data_$TS.tar.gz"
# Оффсайт-копия (настоятельно рекомендуется — сервер один!):
# настройте rclone на Яндекс Object Storage и раскомментируйте:
# rclone copy "$DIR/pb_data_$TS.tar.gz" yandex:tomatsemena-backups/
