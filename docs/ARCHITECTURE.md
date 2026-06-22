# Архитектура

Статический SPA в `apps/web` обращается к Cloudflare Worker в `services/library-api`; данные хранятся в D1. Публичные методы каталога и рецензий доступны без входа. Все изменения пользователя требуют `Authorization: Bearer <token>`.

## Данные

- `library_items` — публичные тайтлы (сохранена совместимость со старой схемой);
- `users` и `sessions` — аккаунты и серверные сессии;
- `user_title_statuses` — один текущий личный статус на пару пользователь–тайтл;
- `title_transactions` — любое число покупок и продаж;
- `reviews` — одна редактируемая рецензия на пару пользователь–тайтл.

Суммы хранятся в целых минимальных единицах. Финансовые итоги считаются отдельно по валютам — курсы не угадываются. Каскадные внешние ключи удаляют зависимые данные. Пароли защищены PBKDF2-SHA-256, в D1 не сохраняются исходные session tokens.

## HTTP API

Авторизация: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

Публично: `GET /api/library`, `GET /api/titles/:id`, `GET /api/titles/:id/reviews`.

С авторизацией: `PUT /api/titles/:id/status`, `POST /api/titles/:id/transactions`, `DELETE /api/transactions/:id`, `PUT|DELETE /api/titles/:id/review`, `GET /api/profile`. Сервер извлекает `userId` только из сессии и проверяет владельца при удалении.

Администратору доступны `GET /api/admin/overview`, смена роли через `PUT /api/admin/users/:id/role` и модерация `DELETE /api/admin/reviews/:id`. Методы управления каталогом `PUT /api/items`, `DELETE /api/items/:id`, `PUT /api/settings`, `PUT /api/library` требуют роль `admin`; проверка выполняется на сервере. Первый пользователь новой установки становится администратором.

## Развёртывание

Перед публикацией API примените миграции: `npm run db:migrate:remote`, затем `npm run deploy`. Разрешённые origins задаются в `wrangler.jsonc`.
