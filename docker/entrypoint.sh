#!/bin/sh
set -e
cd /app

# Laravel-style DB_* → DATABASE_URL (Prisma)
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_HOST:-}" ]; then
  export DATABASE_URL="$(node /app/scripts/ensure-database-url.mjs)"
fi

# Coolify / Docker: aplica migraciones pendientes antes de arrancar la app.
# Nuevas carpetas en prisma/migrations/ se incluyen en la imagen y se ejecutan aquí.
node /app/scripts/migrate-deploy.mjs

cd /app/server
echo "Starting authlevel..."
exec "$@"
