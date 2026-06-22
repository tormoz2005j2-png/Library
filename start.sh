#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/services/library-api"

command -v node >/dev/null 2>&1 || { echo "Нужен Node.js 24+." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Нужен npm." >&2; exit 1; }
[[ -n "${DATABASE_URL:-}" ]] || { echo "Укажите DATABASE_URL PostgreSQL." >&2; exit 1; }

cd "$API_DIR"
[[ -d node_modules ]] || npm ci
npm run db:migrate:postgres
npm run db:seed:postgres
exec npm start
