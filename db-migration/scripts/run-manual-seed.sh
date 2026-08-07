#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a psql connection string, for example postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require}"

SEED_FILE="${1:-seeds/seed_inventory_tools_equipment.sql}"
TENANT_ID="${TENANT_ID:-10000000-0000-0000-0000-000000000001}"

command -v psql >/dev/null 2>&1 || {
  echo "psql is required. Install PostgreSQL client tools first."
  exit 1
}

if [[ ! -f "$SEED_FILE" ]]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

psql "$DATABASE_URL" \
  --set=tenant_id="$TENANT_ID" \
  --file="$SEED_FILE"
