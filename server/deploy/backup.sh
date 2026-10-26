#!/usr/bin/env bash
# Суточная копия сейвов. Класть в cron: 15 4 * * * /usr/local/bin/orakul-backup.sh
set -euo pipefail
SRC="${ORACUL_DATA_DIR:-/var/lib/orakul/data}/users.json"
DEST_DIR="${ORACUL_BACKUP_DIR:-/var/backups/orakul}"
KEEP_DAYS="${ORACUL_BACKUP_KEEP:-14}"

mkdir -p "$DEST_DIR"
if [[ ! -f "$SRC" ]]; then
  echo "[orakul-backup] нет файла $SRC" >&2
  exit 0
fi

stamp="$(date +%Y-%m-%d)"
cp -a "$SRC" "$DEST_DIR/users-${stamp}.json"
# подчистить старые
find "$DEST_DIR" -name 'users-*.json' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
echo "[orakul-backup] ok → $DEST_DIR/users-${stamp}.json"
