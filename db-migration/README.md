# Lorne DB Migration

## Supabase Flow

Use this when the target database is a Supabase project and you want Flyway to own the Lorne application schema from a clean state.

Do not drop Supabase-managed schemas. Only reset `public`.

1. Copy the Supabase Flyway template:

```bash
cd /Applications/SourceCode/property-management/db-migration
cp flyway-supabase.properties.example flyway-supabase.properties
```

2. Edit `flyway-supabase.properties` with your Supabase database host, user, and password.

For migrations, prefer the direct connection:

```properties
flyway.url=jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require
flyway.user=postgres
flyway.password=<database-password>
```

3. Reset only the Supabase `public` schema.

Use a psql connection string, not JDBC:

```bash
cd /Applications/SourceCode/property-management/db-migration
export SUPABASE_DATABASE_URL='postgresql://postgres:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'
CONFIRM_SUPABASE_PUBLIC_SCHEMA_RESET=I_UNDERSTAND_THIS_DELETES_PUBLIC_SCHEMA \
  bash scripts/reset-supabase-public-schema.sh
```

By default the script writes a backup of the current `public` schema under `db-migration/backups/`.

4. Run Flyway:

```bash
cd /Applications/SourceCode/property-management/db-migration
mvn -B flyway:migrate -Dflyway.configFiles=flyway-supabase.properties
```

5. Validate:

```bash
mvn -B flyway:info -Dflyway.configFiles=flyway-supabase.properties
```

## Manual Seed Data

Manual seed files live under `seeds/` and are not part of Flyway migration history.

Inventory, tools, and equipment demo data:

```bash
cd /Applications/SourceCode/property-management/db-migration
export DATABASE_URL='postgresql://postgres:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'
TENANT_ID=10000000-0000-0000-0000-000000000001 \
  bash scripts/run-manual-seed.sh seeds/seed_inventory_tools_equipment.sql
```

For local Docker PostgreSQL, set `DATABASE_URL` to the local psql connection string instead:

```bash
export DATABASE_URL='postgresql://lorne:<password>@localhost:5432/lorne'
bash scripts/run-manual-seed.sh seeds/seed_inventory_tools_equipment.sql
```

The inventory/tools seed is idempotent. Re-running it updates matching rows by item or asset name instead of duplicating them.

## Local Docker Flow

```bash
cd /Applications/SourceCode/property-management/deploy/ec2
docker compose --env-file .env.prod -f docker-compose.yml up -d postgres
docker compose --env-file .env.prod -f docker-compose.yml --profile migrate run --rm db-migration
```

## Why Not `baselineOnMigrate`

`baselineOnMigrate=true` is for adopting an existing schema. For this project, use a clean `public` schema so all enum types, tables, indexes, and repeatable seed data are created by the Lorne migrations in order.
