#!/bin/sh
set -e

echo "[OMNiGRC Data Plane] Starting container initialization..."

if [ -z "$DATABASE_URL" ]; then
  echo "[OMNiGRC ERROR] DATABASE_URL environment variable is required."
  exit 1
fi

if [ -z "$REDIS_URL" ]; then
  echo "[OMNiGRC ERROR] REDIS_URL environment variable is required."
  exit 1
fi

# In standard non-Supabase PostgreSQL deployments, DIRECT_URL equals DATABASE_URL if omitted
if [ -z "$DIRECT_URL" ]; then
  export DIRECT_URL="$DATABASE_URL"
fi

echo "[OMNiGRC Data Plane] Executing database migrations (prisma migrate deploy)..."
npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma

echo "[OMNiGRC Data Plane] Migrations completed successfully. Starting NestJS application..."
exec "$@"
