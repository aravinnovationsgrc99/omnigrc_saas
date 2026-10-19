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

# DIRECT_URL is required for schema migrations (DDL privileges).
# If omitted, it falls back to DATABASE_URL (which must have migration privileges if so configured).
if [ -z "$DIRECT_URL" ]; then
  echo "[OMNiGRC WARNING] DIRECT_URL not set; falling back to DATABASE_URL for migrations."
  export DIRECT_URL="$DATABASE_URL"
fi

echo "[OMNiGRC Data Plane] Executing database migrations (prisma migrate deploy)..."
npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma

echo "[OMNiGRC Data Plane] Migrations completed successfully. Starting NestJS application..."
exec "$@"
