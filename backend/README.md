# Lorne Backend

## Configuration

Backend config belongs in this folder:

- `.env.local`: local development values. `./gradlew :lorne-modulith:bootRun` loads this by default.
- `.env`: production-style template. Use real secrets through your server, Docker, or secret manager.

You can select another env file with:

```bash
ENV_FILE=.env ./gradlew :lorne-modulith:bootRun
```

or:

```bash
./gradlew :lorne-modulith:bootRun -Denv.file=.env
```

The active Spring profile comes from `SPRING_PROFILES_ACTIVE` in the selected env file, unless you override it with `-Dspring.profiles.active=...`.

## Run Locally

Start PostgreSQL and Redis, then run migrations:

```bash
cd /Applications/SourceCode/property-management/deploy/ec2
docker compose --env-file .env.prod -f docker-compose.yml up -d postgres redis
docker compose --env-file .env.prod -f docker-compose.yml --profile migrate run --rm db-migration
```

Start the Spring Boot app:

```bash
cd /Applications/SourceCode/property-management/backend
./gradlew :lorne-modulith:bootRun
```

Health check:

```bash
curl http://localhost:8091/api/v1/system/health
```

Useful local users when `LORNE_BOOTSTRAP_ENABLED=true`:

- `superadmin@lorne.local` / `Password123!`
- `tenantadmin@lorne.local` / `Password123!`
- `worker@lorne.local` / `Password123!`

Tenant admins manage tenant login accounts and roles from Administration -> Users. Link a Field Worker user to a worker profile there so the worker app can show assigned jobs.
