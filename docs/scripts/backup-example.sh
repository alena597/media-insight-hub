#!/usr/bin/env bash
# Приклад щоденного бекапу data.json на Linux.

set -euo pipefail
MIH_ROOT="${MIH_ROOT:-/opt/mih}"
BACKUP_DIR="${BACKUP_DIR:-/backup/mih}"
DATA_FILE="${MIH_ROOT}/server/data.json"
DATE="$(date +%Y%m%d_%H%M)"

mkdir -p "${BACKUP_DIR}/${DATE}"
if [[ -f "$DATA_FILE" ]]; then
  cp -a "$DATA_FILE" "${BACKUP_DIR}/${DATE}/data.json"
  echo "OK: ${BACKUP_DIR}/${DATE}/data.json"
else
  echo "Файл не знайдено: $DATA_FILE" >&2
  exit 1
fi
