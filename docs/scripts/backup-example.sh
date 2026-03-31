#!/usr/bin/env bash

set -euo pipefail
MIH_ROOT="${MIH_ROOT:-/opt/mih}"
BACKUP_DIR="${BACKUP_DIR:-/backup/mih}"
DATA_FILE="${MIH_ROOT}/server/data.db"
DATE="$(date +%Y%m%d_%H%M)"

mkdir -p "${BACKUP_DIR}/${DATE}"
if [[ -f "$DATA_FILE" ]]; then
  sqlite3 "$DATA_FILE" ".backup '${BACKUP_DIR}/${DATE}/data.db'"
  echo "OK: ${BACKUP_DIR}/${DATE}/data.db"
else
  echo "Файл не знайдено: $DATA_FILE" >&2
  exit 1
fi
