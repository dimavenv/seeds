#!/usr/bin/env bash
# Бэкап PocketBase: целостная копия SQLite + архив всей папки pb_data (с файлами
# фото). Хранит последние 14 дней локально и, если настроено, выгружает копию
# в облачное S3-хранилище (Yandex Object Storage и т.п.) через rclone.
#
# Подключение по расписанию и настройка облака — SETUP-DB-RU.md, шаг 8.
# Восстановление — deploy/pb-restore.sh (проверьте его ЗАРАНЕЕ, а не в тот день,
# когда база уже развалилась).
set -euo pipefail

PB_DATA=/opt/pocketbase/pb_data
DIR=/opt/pocketbase/backups
KEEP_DAYS=14
TS=$(date +%F_%H%M)

# Настройки: /opt/pocketbase/backup.conf
#   BACKUP_PASSPHRASE=длинная-случайная-строка   — шифровать архив (см. ниже)
#   RCLONE_REMOTE=yandex:tomatsemena-backups     — куда выгружать копию
[ -f /opt/pocketbase/backup.conf ] && source /opt/pocketbase/backup.conf

mkdir -p "$DIR"
chmod 700 "$DIR"

# Целостный снимок базы даже под нагрузкой (sqlite3 .backup)
SNAPSHOT="$DIR/data_$TS.db"
sqlite3 "$PB_DATA/data.db" ".backup '$SNAPSHOT'"

# Снимок обязан быть читаемым. Битую копию лучше заметить сейчас, чем в день
# восстановления: молча сложить в облако повреждённый файл — худший исход.
if ! sqlite3 "$SNAPSHOT" "PRAGMA integrity_check;" | grep -q '^ok$'; then
  echo "ОШИБКА: снимок $SNAPSHOT не прошёл проверку целостности" >&2
  exit 1
fi

# Полный архив pb_data: база + загруженные файлы (фото товаров)
ARCHIVE="$DIR/pb_data_$TS.tar.gz"
tar czf "$ARCHIVE" -C "$(dirname "$PB_DATA")" "$(basename "$PB_DATA")"

# --- Шифрование ---
#
# В архиве лежат телефоны, адреса и почта покупателей, хеши паролей и файлы
# сессий. Ключ DATA_ENCRYPTION_KEY шифрует ОТДЕЛЬНЫЕ поля заказов, но не весь
# архив целиком — а уезжает архив в чужое хранилище, где его читает кто угодно
# с доступом к бакету. Поэтому перед выгрузкой шифруем симметрично (AES-256).
#
# Пароль хранится в /opt/pocketbase/backup.conf (chmod 600) и ОБЯЗАН быть
# записан где-то ещё: без него архив не восстановить — это и есть смысл
# шифрования.
UPLOAD="$ARCHIVE"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  if ! command -v gpg >/dev/null; then
    echo "ОШИБКА: задан BACKUP_PASSPHRASE, но gpg не установлен (apt install gnupg)" >&2
    exit 1
  fi
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --yes \
    --passphrase-fd 0 --pinentry-mode loopback \
    --symmetric --cipher-algo AES256 \
    --output "$ARCHIVE.gpg" "$ARCHIVE"
  # Незашифрованный архив на диске не оставляем.
  rm -f "$ARCHIVE"
  UPLOAD="$ARCHIVE.gpg"
else
  echo "ВНИМАНИЕ: BACKUP_PASSPHRASE не задан — архив сохранён без шифрования." >&2
  echo "          Для выгрузки в облако это небезопасно, см. SETUP-DB-RU.md, шаг 8." >&2
fi

chmod 600 "$SNAPSHOT" "$UPLOAD"

# Чистим локальные старше KEEP_DAYS дней
find "$DIR" -type f -mtime +$KEEP_DAYS -delete

echo "OK (локально): $UPLOAD"

# --- Оффсайт-копия в облако (необязательно) ---
if [ -n "${RCLONE_REMOTE:-}" ]; then
  if rclone copy "$UPLOAD" "$RCLONE_REMOTE/"; then
    echo "OK (облако): $RCLONE_REMOTE/$(basename "$UPLOAD")"
    # Чистим в облаке старше KEEP_DAYS дней (бакет должен быть выделен под бэкапы!)
    rclone delete --min-age ${KEEP_DAYS}d "$RCLONE_REMOTE/" 2>/dev/null || true
  else
    echo "ВНИМАНИЕ: выгрузка в облако не удалась (локальная копия сохранена)."
  fi
fi
