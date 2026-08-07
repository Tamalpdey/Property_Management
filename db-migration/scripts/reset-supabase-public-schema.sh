#!/usr/bin/env bash
set -euo pipefail

CONFIRM_PHRASE="I_UNDERSTAND_THIS_DELETES_PUBLIC_SCHEMA"

if [[ "${CONFIRM_SUPABASE_PUBLIC_SCHEMA_RESET:-}" != "$CONFIRM_PHRASE" ]]; then
  cat <<EOF
Refusing to reset Supabase public schema.

This deletes every table, type, function, view, and Flyway history object in schema "public".
Supabase-managed schemas such as auth, storage, realtime, graphql, and vault are not touched.

Run again with:
  CONFIRM_SUPABASE_PUBLIC_SCHEMA_RESET=$CONFIRM_PHRASE
EOF
  exit 1
fi

: "${SUPABASE_DATABASE_URL:?Set SUPABASE_DATABASE_URL to a psql connection string, for example postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require}"

command -v psql >/dev/null 2>&1 || {
  echo "psql is required. Install PostgreSQL client tools first."
  exit 1
}

if [[ "${BACKUP_PUBLIC_SCHEMA:-true}" == "true" ]]; then
  command -v pg_dump >/dev/null 2>&1 || {
    echo "pg_dump is required when BACKUP_PUBLIC_SCHEMA=true. Set BACKUP_PUBLIC_SCHEMA=false to skip backup."
    exit 1
  }
  mkdir -p backups
  backup_file="backups/supabase-public-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump --format=custom --schema=public --file="$backup_file" "$SUPABASE_DATABASE_URL"
  echo "Backup written to db-migration/$backup_file"
fi

psql "$SUPABASE_DATABASE_URL" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, service_role, authenticated, anon;
SQL

echo "Supabase public schema reset complete. You can now run Flyway migrations."
