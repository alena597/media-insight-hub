# Розгортання у production (Release engineer / DevOps)

Цей документ описує розгортання Media Insight Hub у виробничому середовищі: статичний фронтенд (React/Vite build), Node.js API та персистентне сховище `data.json`.

## 1. Архітектура розгортання

- Frontend: статичні файли з каталогу `dist/` після `npm run build`.
- Backend: процес Node.js (`server/`), слухає HTTP (типово порт `4000`).
- Дані: один JSON-файл на диску (`server/data.json` або шлях з `DATABASE_PATH`).
- Рекомендовано: reverse proxy (Nginx, Caddy) — TLS, проксування `/api` на backend, роздача статики з `dist/`.

## 2. Вимоги до апаратного забезпечення

| Ресурс | Мінімум (мале навантаження) | Рекомендовано |
|--------|----------------------------|---------------|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 GB (Node + ОС) | 2 GB+ |
| Диск | 5 GB (ОС + застосунок + логи) | 20 GB+ з запасом під росту `data.json` та бекапи |
| Архітектура | x86_64 або ARM64 (Node.js LTS підтримує обидві) | — |

> Навантаження AI (TensorFlow.js) припадає на клієнтські браузери; сервер переважно обслуговує API та файлові операції.

## 3. Необхідне програмне забезпечення

- ОС: Linux (Ubuntu 22.04 LTS або новіше), або Windows Server з підтримкою Node.js LTS.
- Node.js: 20.x LTS (або 18.x EOL з урахуванням ризиків).
- Пакетний менеджер: npm (йде з Node).
- Веб-сервер / reverse proxy: Nginx 1.18+ або Caddy 2.x (HTTPS, проксі).
- Процес-менеджер (рекомендовано): systemd, PM2, або контейнеризація (див. `docker-compose.yml` у репозиторії, якщо наявний).


## 4. Налаштування сховища даних (замість класичної СУБД)

Проєкт використовує файл JSON:

- Змінна `DATABASE_PATH` у `server/.env` вказує шлях до файлу.
- Каталог має бути доступний для запису користувачу, під яким працює Node.
- Рекомендовано тримати файл на окремому томі або регулярно копіювати (див. `backup.md`).

Міграції схеми «БД» у проєкті не автоматизовані; при зміні формату файлу потрібен ручний або скриптований перенос.

## 5. Розгортання коду

1. Клонувати репозиторій на сервер (окремий користувач `deploy` або CI).
2. У корені: `npm ci --legacy-peer-deps` → `npm run build` → артефакт у `dist/`.
3. У `server/`: `npm ci --omit=dev` (або `npm install --omit=dev`).
4. Створити `server/.env` (див. `server/.env.example`): `JWT_SECRET`, `PORT`, `FRONTEND_ORIGIN`, `DATABASE_PATH`.
5. Скопіювати `dist/` у каталог веб-сервера (наприклад `/var/www/mih/dist/`).
6. Запустити API через systemd/PM2 (див. нижче).


```ini
[Unit]
Description=Media Insight Hub API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mih/server
EnvironmentFile=/opt/mih/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`systemctl daemon-reload && systemctl enable --now mih-api`.


## 6. CI/CD (GitHub Actions)

У репозиторії налаштовано workflow розгортання документації TypeDoc на GitHub Pages (`.github/workflows/docs.yml`). Повний деплой застосунку на власний сервер можна додати окремим workflow (build → SSH/rsync → restart) — за політикою вашої команди.

## 7. Контейнеризація (Docker)

У корені репозиторію:

- `docker-compose.yml` — сервіси `api` (Node) та `web` (Nginx + зібраний SPA).
- `Dockerfile` — багатоетапна збірка фронтенду та образ Nginx.
- `server/Dockerfile` — образ API.
- `deploy/nginx.conf` — проксування `/api` → контейнер `api`.

### Запуск у контейнерах (тест / демо)

Потрібні встановлені Docker та Docker Compose v2.

1. Задайте секрет (або через змінну оточення, або `.env` поруч із `docker-compose.yml`):

   ```bash
   export JWT_SECRET="довгий-випадковий-рядок-мінімум-32-символи"
   ```

2. З кореня репозиторію:

   ```bash
   docker compose up --build
   ```

3. Відкрийте http://localhost:8080 — статика та `/api` через один хост.

Дані зберігаються у томі `mih-data` (файл `/data/data.json` всередині контейнера API). Для production задайте надійний `JWT_SECRET` і налаштуйте резервне копіювання тому або знімок.

---

Пов’язані документи: [update.md](update.md) · [backup.md](backup.md)
