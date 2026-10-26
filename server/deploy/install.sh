#!/usr/bin/env bash
# Установка API на чистый Ubuntu VPS. Запуск: bash install.sh
set -euo pipefail

REPO_URL="${ORACUL_REPO:-https://github.com/IgorKulyanov/might-of-orakul.git}"
APP_DIR="${ORACUL_APP_DIR:-/opt/orakul}"
DATA_DIR="${ORACUL_DATA_DIR:-/var/lib/orakul/data}"
BACKUP_DIR="${ORACUL_BACKUP_DIR:-/var/backups/orakul}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запусти от root: sudo bash install.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$DATA_DIR" "$BACKUP_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
fi

cd "$APP_DIR/server"
npm install --omit=dev

install -m 644 "$APP_DIR/server/deploy/orakul-api.service" /etc/systemd/system/orakul-api.service
install -m 755 "$APP_DIR/server/deploy/backup.sh" /usr/local/bin/orakul-backup.sh

systemctl daemon-reload
systemctl enable orakul-api
systemctl restart orakul-api

sleep 1
echo "=== health ==="
curl -sS "http://127.0.0.1:8787/api/health" || true
echo
echo "Готово. Залей users.json в: $DATA_DIR/users.json"
echo "Потом: systemctl restart orakul-api"
echo "Сайт: VITE_API_URL=http://$(curl -sS ifconfig.me 2>/dev/null || echo ТВОЙ_IP):8787"
