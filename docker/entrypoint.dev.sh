#!/bin/sh
set -e
cd /app
export CI=true

if [ ! -d node_modules/.pnpm ]; then
  echo "Installing dependencies..."
  pnpm install
  PRISMA_GENERATE_SKIP_AUTOINSTALL=1 pnpm exec prisma generate
fi

# Laravel-style DB_* → DATABASE_URL (Prisma)
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_HOST:-}" ]; then
  export DATABASE_URL="$(node /app/scripts/ensure-database-url.mjs)"
fi

node /app/scripts/migrate-deploy.mjs

mkdir -p /app/server/uploads/avatars
echo "Starting authlevel (hot reload)..."
exec "$@"
