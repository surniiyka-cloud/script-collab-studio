#!/usr/bin/env bash
# Verify that the checked-in Prisma migration can create all core tables
# in a new, throwaway database in the LOCAL Docker Compose PostgreSQL.
# Does not connect to production and never deletes the developer's "studio" DB.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required" >&2; exit 1; }

docker compose up -d postgres

for attempt in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U studio -d studio >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "Local Compose PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

# Identifier consists strictly of a constant prefix and random hex.
name="studio_verify_$(node -e 'process.stdout.write(require("node:crypto").randomBytes(8).toString("hex"))')"
local_url="postgresql://studio:studio_dev_only@127.0.0.1:5432/${name}?schema=public"

cleanup() {
  docker compose exec -T postgres psql -U studio -d studio -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${name}\" WITH (FORCE);" >/dev/null || true
}
trap cleanup EXIT

docker compose exec -T postgres psql -U studio -d studio -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"${name}\";" >/dev/null

echo "Applying checked-in migration to a disposable database..."
(
  cd apps/api
  DATABASE_URL="$local_url" pnpm exec prisma migrate deploy
  DATABASE_URL="$local_url" pnpm exec prisma migrate status
)

tables="$(docker compose exec -T postgres psql -U studio -d "$name" -A -t -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('User','Project','Script','Scene','Node','Edge','YDocState');" | tr -d '\r\n[:space:]')"
if [[ "$tables" != "7" ]]; then
  echo "Expected 7 core tables, got ${tables}; migration replay FAILED" >&2
  exit 1
fi
echo "PASS: A fresh, disposable PostgreSQL database was initialized from the committed Prisma migration (7 core tables)."
