# Docker Hub Images

All six application images are published to one Docker Hub repository using distinct service tags:

```dotenv
IMAGE_REPOSITORY=maplepropertyservices/maple-property-mgmt
IMAGE_TAG=latest
```

These settings are in `deploy/ec2/.env.prod` (and the committed `.env.example`). They replace the former `IMAGE_PREFIX` setting. Update the server's environment file too; keep all database/storage credentials unchanged.

For release `latest`, the tags are `latest-edge`, `latest-lorne-modulith`, `latest-public-site`, `latest-tenant-portal`, `latest-admin-portal`, and `latest-worker-app`. Each tag identifies a different image; do not publish every service to the same tag. Redis and the migration runner continue using their upstream images.

## Build and Publish Locally

Authenticate interactively with a Docker account that has write permission to this repository. If the namespace is an organization, use a member account with repository access. Enter an access token at the password prompt; never put credentials in Compose, scripts, or Git.

```bash
docker login --username YOUR_DOCKER_USERNAME
cd deploy/ec2
./run-stack.sh prod build-push
```

To publish only one service:

```bash
./run-stack.sh prod build-push lorne-modulith
```

Use a versioned release instead of overwriting `latest` when rollback is needed. Use the same value on the build machine and server:

```bash
IMAGE_TAG=20261016 ./run-stack.sh prod build-push
```

This produces, for example, `maplepropertyservices/maple-property-mgmt:20261016-lorne-modulith`. The default target is `linux/amd64` for OVH.

## Deploy on OVH

Update `.env.prod` on the server to the same repository and release tag. Log in with pull access if the repository is private. From `deploy/ec2`:

```bash
./run-stack.sh prod pull
./run-stack.sh prod migrate
./run-stack.sh prod deploy
```

The migration command still requires the repository's `db-migration` directory on the server. Before migrating, ensure the database is backed up and follow the normal deployment maintenance procedure. This image naming change alone does not add a database migration.

An individual image can also be pushed manually after building it:

```bash
docker push maplepropertyservices/maple-property-mgmt:latest-lorne-modulith
```

This does not publish to the previous Docker Hub namespace. To use another repository with the same tag scheme, set `IMAGE_REPOSITORY` for both build and deployment; existing services are not retagged automatically.
