#!/usr/bin/env bash
# Восстановление PocketBase из архива, сделанного deploy/pb-backup.sh.
#
#   sudo bash deploy/pb-restore.sh /opt/pocketbase/backups/pb_data_2026-08-17_0300.tar.gz.gpg
#   sudo bash deploy/pb-restore.sh --check <архив>   # проверка без замены базы
#
# Бэкап, который ни разу не разворачивали, — это не бэкап, а надежда. Режим
# --check разворачивает архив во временную папку, проверяет целостность базы и
# показывает, что внутри (сколько заказов, товаров, аккаунтов), НЕ трогая
# рабочие данные. Прогоняйте его хотя бы раз в квартал.
set -euo pipefail

MODE=restore
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi

ARCHIVE="${1:-}"
PB_DATA=/opt/pocketbase/pb_data

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Укажите файл архива. Пример:" >&2
  echo "  sudo bash deploy/pb-restore.sh --check /opt/pocketbase/backups/pb_data_*.tar.gz.gpg" >&2
  exit 1
fi

[ -f /opt/pocketbase/backup.conf ] && source /opt/pocketbase/backup.conf

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Расшифровка, если архив зашифрован.
SOURCE="$ARCHIVE"
if [[ "$ARCHIVE" == *.gpg ]]; then
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    echo "Архив зашифрован, а BACKUP_PASSPHRASE не задан в /opt/pocketbase/backup.conf" >&2
    exit 1
  fi
  SOURCE="$WORK/archive.tar.gz"
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --yes \
    --passphrase-fd 0 --pinentry-mode loopback \
    --decrypt --output "$SOURCE" "$ARCHIVE"
  echo "Архив расшифрован."
fi

tar xzf "$SOURCE" -C "$WORK"
RESTORED="$WORK/pb_data"
if [ ! -f "$RESTORED/data.db" ]; then
  echo "В архиве нет pb_data/data.db — это не бэкап PocketBase" >&2
  exit 1
fi

if ! sqlite3 "$RESTORED/data.db" "PRAGMA integrity_check;" | grep -q '^ok$'; then
  echo "ОШИБКА: база в архиве повреждена" >&2
  exit 1
fi

echo "Проверка целостности: ok"
for table in orders order_items products users; do
  count=$(sqlite3 "$RESTORED/data.db" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "нет таблицы")
  echo "  $table: $count"
done
echo "  файлов в архиве: $(find "$RESTORED" -type f | wc -l)"

if [ "$MODE" = check ]; then
  echo
  echo "Режим проверки: рабочая база НЕ тронута."
  exit 0
fi

echo
read -r -p "Заменить рабочую базу этим архивом? Текущая будет сохранена рядом. [y/N] " answer
[ "$answer" = "y" ] || { echo "Отменено."; exit 0; }

systemctl stop pocketbase
# Текущие данные не удаляем, а отодвигаем: если восстановились не из того
# архива, откатиться можно сразу.
if [ -d "$PB_DATA" ]; then
  mv "$PB_DATA" "${PB_DATA}.before-restore-$(date +%F_%H%M)"
fi
mv "$RESTORED" "$PB_DATA"
chown -R pocketbase:pocketbase "$PB_DATA"
systemctl start pocketbase

echo "Готово. Проверьте: curl -s http://127.0.0.1:8090/api/health"
