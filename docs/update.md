# Оновлення системи та відкат (Release engineer / DevOps)

Інструкція для оновлення Media Insight Hub у production з мінімізацією простою та можливістю rollback.

## 1. Підготовка до оновлення

- Ознайомтесь із changelog / комітами релізу (зміни API, нові змінні `.env`, зміни схеми БД).
- Заплануйте вікно обслуговування, якщо потрібна зупинка API (зазвичай < 1 хвилини при коректному процесі).

## 2. Резервні копії перед оновленням

Обов’язково перед зміною коду:

1. Зробіть резервну копію `server/data.db` (та `.db-shm`, `.db-wal` якщо є) — або файлу за `DB_PATH`.
2. Скопіюйте `server/.env` (без публікації в git).
3. За наявності — зніміть копію поточного каталогу релізу (`/opt/mih`) або використайте процедуру з [backup.md](backup.md).

## 3. Перевірка сумісності

- Локально або на staging: `npm run build`, `npm run check`, запуск API + перевірка `/api/health` та сценарію логіну.
- Якщо змінилась схема БД — перевірте, чи нові `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` вже додані в `db.js`; за потреби підготуйте скрипт міграції.

## 4. Планування простою

- Для оновлення лише статики (`dist/`) можна використати atomic replace каталогу — простій мінімальний.
- Для оновлення Node-залежностей API: коротка зупинка `systemctl stop mih-api` (або PM2 restart).

## 5. Процес оновлення (покроково)

### 5.1. Зупинка служби API

```bash
sudo systemctl stop mih-api
# або: pm2 stop mih-api
```

### 5.2. Розгортання нового коду

```bash
cd /opt/mih
sudo -u deploy git fetch origin
sudo -u deploy git checkout <tag-або-commit>
npm ci --legacy-peer-deps
npm run build
cd server && npm ci --omit=dev && cd ..
```

### 5.3. Міграція схеми БД

- Якщо реліз не додає нових таблиць/колонок — нічого не робити; схема ініціалізується через `CREATE TABLE IF NOT EXISTS` при старті.
- Якщо є зміни схеми (нові колонки, індекси) — виконати SQL-міграцію до старту API на резервній копії бази, перевірити цілісність.

### 5.4. Оновлення конфігурацій

- Порівняти `server/.env.example` з поточним `.env`; додати нові змінні (зокрема `DB_PATH` якщо база перенесена).
- Перевірити Nginx/Caddy після змін у шляхах до `dist/`.

### 5.5. Запуск і перевірка

```bash
sudo systemctl start mih-api
curl -sS http://127.0.0.1:4000/api/health
```

Зовнішньо: `https://<домен>/api/health`, тест входу в застосунок.

## 6. Перевірка після оновлення

- HTTP 200 на головній та `/api/health`.
- Реєстрація нового користувача або вхід існуючого.
- Перегляд логів: `journalctl -u mih-api -n 100 --no-pager`.

## 7. Процедура відкату (rollback)

Виконуйте, якщо після оновлення критична помилка і потрібно швидко повернутися до попередньої версії.

### 7.1. Зупинка API

```bash
sudo systemctl stop mih-api
```

### 7.2. Повернення коду

```bash
cd /opt/mih
git checkout <попередній-tag-або-commit>
npm ci --legacy-peer-deps
npm run build
cd server && npm ci --omit=dev && cd ..
```

### 7.3. Повернення даних

Відновіть **`data.db`** (і за потреби `.env`) з резервної копії, зробленої перед оновленням:

```bash
sudo cp /backup/mih/data.db.pre-update /opt/mih/server/data.db
sudo chown www-data:www-data /opt/mih/server/data.db
```

### 7.4. Запуск

```bash
sudo systemctl start mih-api
```

### 7.5. Перевірка

Ті самі кроки, що в розділі 6. Зафіксуйте інцидент і план виправлення перед повторною спробою оновлення.

---

Пов’язані документи: [deployment.md](deployment.md) · [backup.md](backup.md)
