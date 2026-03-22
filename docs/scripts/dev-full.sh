set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[mih] Корінь репозиторію: $ROOT"

if [[ ! -d node_modules ]]; then
  echo "[mih] Встановлення залежностей фронтенду..."
  npm install --legacy-peer-deps
fi

if [[ ! -d server/node_modules ]]; then
  echo "[mih] Встановлення залежностей API..."
  (cd server && npm install)
fi

if [[ ! -f server/.env ]]; then
  echo "[mih] УВАГА: створіть server/.env з server/.env.example (JWT_SECRET)."
fi

echo "[mih] Запуск Vite + API..."
npm run dev:full
