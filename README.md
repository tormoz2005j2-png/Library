# Моя библиотека

Личное веб-приложение для учёта книг, комиксов и манги. Репозиторий разделён на независимые интерфейс, API и миграции базы данных.

## Структура

```text
.
├── apps/
│   └── web/                         # Статический клиент
│       ├── index.html
│       └── assets/
│           ├── css/main.css
│           └── js/
│               ├── app.js          # UI и бизнес-логика
│               ├── config.js       # Публичный адрес API
│               └── library-api-client.js
├── services/
│   └── library-api/                 # Защищённый серверный API
│       ├── migrations/
│       │   └── 0001_initial.sql
│       ├── src/index.js
│       ├── package.json
│       └── wrangler.jsonc
├── docs/
│   └── ARCHITECTURE.md
├── .github/workflows/
│   └── deploy-web.yml              # Публикация только apps/web
└── README.md
```

## Локальный запуск интерфейса

```bash
python3 -m http.server 8000 --directory apps/web
```

Откройте `http://localhost:8000`. Адрес API задаётся в `apps/web/assets/js/config.js`; секретного ключа в репозитории нет.

Интерфейс публикуется в GitHub Pages отдельным workflow. В артефакт попадает только `apps/web`, серверный код и миграции не отдаются как файлы сайта.

## Работа с API

```bash
cd services/library-api
npm install
npm run dev
```

Доступные команды:

- `npm run dev` — локальный API;
- `npm run db:init:local` — применить схему к локальной БД;
- `npm run db:init:remote` — применить схему к удалённой БД;
- `npm run secret` — установить серверный секрет;
- `npm run deploy` — опубликовать API.

Текущая серверная реализация использует адаптер Cloudflare Worker/D1, но веб-приложение зависит только от HTTP-контракта. Его можно заменить другим сервером и БД, не переписывая интерфейс — подробности в [архитектурной документации](docs/ARCHITECTURE.md).

## Данные

- Основное хранилище — серверная БД.
- `localStorage` читается только для одноразовой миграции старой версии.
- Личный API-ключ хранится в `sessionStorage` до закрытия вкладки.
- Экспорт и импорт JSON остаются независимым резервным механизмом.
