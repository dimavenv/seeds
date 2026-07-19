#!/usr/bin/env bash
# Бэкап PocketBase: целостная копия SQLite + архив всей папки pb_data (с файлами
# фото). Хранит последние 14 дней локально и, если настроено, выгружает копию
# в облачное S3-хранилище (Yandex Object Storage и т.п.) через rclone.
#
# Подключение по расписанию и настройка облака — SETUP-DB-RU.md, шаг 8.
set -euo pipefail

PB_DATA=/opt/pocketbase/pb_data
DIR=/opt/pocketbase/backups
KEEP_DAYS=14
TS=$(date +%F_%H%M)

mkdir -p "$DIR"

# Целостный снимок базы даже под нагрузкой (sqlite3 .backup)
sqlite3 "$PB_DATA/data.db" ".backup '$DIR/data_$TS.db'"

# Полный архив pb_data: база + загруженные файлы (фото товаров)
ARCHIVE="$DIR/pb_data_$TS.tar.gz"
tar czf "$ARCHIVE" -C "$(dirname "$PB_DATA")" "$(basename "$PB_DATA")"

# Чистим локальные старше KEEP_DAYS дней
find "$DIR" -type f -mtime +$KEEP_DAYS -delete

echo "OK (локально): $ARCHIVE"

# --- Оффсайт-копия в облако (необязательно) ---
# Чтобы включить: создайте /opt/pocketbase/backup.conf со строкой вида
#   RCLONE_REMOTE=yandex:tomatsemena-backups
# (yandex — имя remote из rclone.conf, tomatsemena-backups — бакет для бэкапов).
[ -f /opt/pocketbase/backup.conf ] && source /opt/pocketbase/backup.conf

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if rclone copy "$ARCHIVE" "$RCLONE_REMOTE/"; then
    echo "OK (облако): $RCLONE_REMOTE/$(basename "$ARCHIVE")"
    # Чистим в облаке старше KEEP_DAYS дней (бакет должен быть выделен под бэкапы!)
    rclone delete --min-age ${KEEP_DAYS}d "$RCLONE_REMOTE/" 2>/dev/null || true
  else
    echo "ВНИМАНИЕ: выгрузка в облако не удалась (локальная копия сохранена)."
  fi
fi
