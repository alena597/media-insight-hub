@echo off
chcp 65001 >nul
set ROOT=%~dp0..\..
cd /d "%ROOT%"

echo [mih] Корінь репозиторію: %CD%

if not exist "node_modules\" (
  echo [mih] Встановлення залежностей фронтенду...
  call npm install --legacy-peer-deps
)

if not exist "server\node_modules\" (
  echo [mih] Встановлення залежностей API...
  pushd server
  call npm install
  popd
)

if not exist "server\.env" (
  echo [mih] УВАГА: створіть server\.env з server\.env.example ^(JWT_SECRET^).
)

echo [mih] Запуск Vite + API...
call npm run dev:full
