# Скрипти автоматизації

Усі шляхи вказані відносно кореня репозиторію (перейдіть в корінь перед запуском або використовуйте наведені `.bat`/`.sh`).

| Файл | Опис |
|------|------|
| [dev-full.bat](dev-full.bat) | Windows: встановлення залежностей (якщо потрібно) + запуск фронтенду та API одночасно |
| [dev-full.sh](dev-full.sh) | Linux/macOS: те саме |
| [backup-example.sh](backup-example.sh) | Приклад копіювання `data.db` на сервері Linux (cron) |

> Для production краще використовувати systemd, PM2 або Docker (див. `docker-compose.yml` у корені та [deployment.md](../deployment.md)).
