# Моя библиотека

Публичный каталог книг, комиксов и манги с пользовательскими кабинетами, личными статусами, оценками, рецензиями, покупками/продажами и административной панелью.

## Архитектура

```text
apps/web/                              HTML, CSS и browser JavaScript
services/library-api/src/index.js      HTTP-контракт и бизнес-логика
services/library-api/src/server.js     Node.js/Fastify entry point
services/library-api/src/postgres-adapter.js
services/library-api/migrations-postgres/
services/library-api/seeds/catalog.json
railway.json                           конфигурация Railway
```

Один Node.js-сервис раздаёт frontend и API с одного origin. Данные хранятся в PostgreSQL. Старые файлы D1 сохранены в `services/library-api/migrations` только для истории миграции.

## Локальный запуск

Нужны Node.js 24+ и PostgreSQL:

```bash
export DATABASE_URL='postgresql://user:password@localhost:5432/library'
./start.sh
```

Приложение откроется на `http://localhost:3000`. При первом запуске применится схема и загрузятся 963 тайтла; повторный запуск seed не перезаписывает данные.

## Команды

```bash
cd services/library-api
npm ci
npm run check
npm test
npm run db:migrate:postgres
npm run db:seed:postgres
npm start
```

## Railway

Проект собирается корневым `railway.json` и `services/library-api/Dockerfile`. Для приложения нужны переменные:

- `DATABASE_URL` — ссылка на PostgreSQL Railway;
- `NODE_ENV=production`;
- `DATABASE_SSL=false` для внутреннего Railway PostgreSQL;
- опционально `ALLOWED_ORIGINS`, если frontend будет вынесен на другой домен.

## Безопасность

- пароли хешируются PBKDF2-SHA-256 с индивидуальной солью и 210 000 итераций;
- в базе хранится только SHA-256 отпечаток session token;
- первая зарегистрированная учётная запись получает роль администратора;
- финансовые суммы хранятся целыми минимальными единицами;
- операции пользователя проверяются сервером по владельцу.

Подробности: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
