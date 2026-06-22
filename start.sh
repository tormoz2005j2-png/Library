#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/services/library-api"
WEB_DIR="$ROOT_DIR/apps/web"
API_PORT="8787"
WEB_PORT="${WEB_PORT:-8000}"
API_PID=""
WEB_PID=""

cleanup() {
  trap - EXIT INT TERM
  printf '\nОстанавливаю локальные сервисы…\n'
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}

fail() {
  printf 'Ошибка: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "не найден Node.js 20+. Установите его с https://nodejs.org/"
command -v npm >/dev/null 2>&1 || fail "не найден npm. Он устанавливается вместе с Node.js."
command -v python3 >/dev/null 2>&1 || fail "не найден Python 3, необходимый для локального веб-сервера."

if [[ ! -d "$API_DIR/node_modules" ]]; then
  printf 'Устанавливаю зависимости API…\n'
  (cd "$API_DIR" && npm ci)
fi

printf 'Применяю локальные миграции D1…\n'
(cd "$API_DIR" && npm run db:migrate:local)

trap cleanup EXIT INT TERM

printf 'Запускаю API на http://localhost:%s…\n' "$API_PORT"
(
  cd "$API_DIR"
  npm exec wrangler -- dev --port "$API_PORT" \
    --var "ALLOWED_ORIGINS:http://localhost:$WEB_PORT"
) &
API_PID=$!

printf 'Запускаю сайт на http://localhost:%s…\n' "$WEB_PORT"
python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 --directory "$WEB_DIR" &
WEB_PID=$!

sleep 1
kill -0 "$API_PID" 2>/dev/null || fail "API завершился при запуске. Проверьте вывод Wrangler выше."
kill -0 "$WEB_PID" 2>/dev/null || fail "веб-сервер завершился при запуске. Возможно, порт $WEB_PORT занят."

printf '\nПроект запущен: http://localhost:%s\n' "$WEB_PORT"
printf 'Для остановки нажмите Ctrl+C.\n\n'

if [[ "${OPEN_BROWSER:-0}" == "1" ]]; then
  if command -v open >/dev/null 2>&1; then open "http://localhost:$WEB_PORT"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$WEB_PORT"
  fi
fi

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

fail "один из локальных сервисов неожиданно остановился."
