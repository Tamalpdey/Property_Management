#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
ACTION="${2:-up}"
SERVICE="${3:-}"
PLATFORM="${TARGET_PLATFORM:-${4:-linux/amd64}}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
Usage:
./run-stack.sh <local|prod> <action> [service] [platform]

Examples:
./run-stack.sh prod pull-deploy
./run-stack.sh prod pull-deploy lorne-modulith
./run-stack.sh prod build-push worker-app linux/amd64
./run-stack.sh prod pull-deploy "" linux/amd64
./run-stack.sh prod migrate
./run-stack.sh prod website-build-push
./run-stack.sh prod website-pull-deploy

Env:
TARGET_PLATFORM=linux/amd64

Actions:
up            Build and deploy all services, or one service
down          Stop all services
build         Build image(s) only. Does not start containers
push          Push image(s) only. Does not start containers
build-push    Build and push image(s) only. Does not start containers
restart       Restart all services, or one service
rebuild       Rebuild image(s) only. Does not push or start containers
pull          Pull latest image(s)
deploy        Deploy already-built/pulled image(s) without local build
pull-deploy   Pull latest image(s) and deploy without local build
migrate       Run Flyway migrations against configured external database
ps            Show status
logs          Tail logs
config        Render compose config
website-build       Build public website and updated edge only
website-build-push  Build and push public website and updated edge only
website-deploy      Deploy built/pulled website and edge without rebuilding
website-pull-deploy Pull and deploy website and edge without rebuilding
EOF
}

if [[ -z "$MODE" || ("$MODE" != "local" && "$MODE" != "prod") ]]; then
  usage
  exit 1
fi

export DOCKER_DEFAULT_PLATFORM="$PLATFORM"
export DOCKER_PLATFORM="$PLATFORM"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"

echo "Mode: $MODE"
echo "Action: $ACTION"
echo "Service: ${SERVICE:-all}"
echo "Platform: $DOCKER_DEFAULT_PLATFORM"

if [[ "$MODE" == "local" ]]; then
  export CADDYFILE="Caddyfile.local"
else
  export CADDYFILE="Caddyfile"
fi

compose_cmd=(docker compose --env-file .env.prod -f docker-compose.yml)

deploy_website() {
  # Leave the current edge running if the new public site does not become healthy.
  "${compose_cmd[@]}" up -d --no-build --no-deps --wait --wait-timeout 90 public-site
  "${compose_cmd[@]}" up -d --no-build --no-deps --wait --wait-timeout 90 edge
}

check_private_ports() {
  local rendered
  rendered="$("${compose_cmd[@]}" config)"

  local bad
  bad=$(printf "%s\n" "$rendered" | awk '
    /^  (lorne-modulith|redis):$/ {
      svc=$1
      gsub(":", "", svc)
      in_target=1
      next
    }
    /^  [^[:space:]].*:$/ {
      if ($0 !~ /^  (lorne-modulith|redis):$/) {
        in_target=0
        svc=""
      }
    }
    in_target == 1 && /^    ports:$/ {
      print svc
    }
  ')

  if [[ -n "$bad" ]]; then
    echo "ERROR: private service(s) expose host ports: $bad"
    exit 1
  fi
}

case "$ACTION" in
  up)
    check_private_ports
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" up -d --build "$SERVICE"
    else
      "${compose_cmd[@]}" up -d --build
    fi
    ;;
  down)
    "${compose_cmd[@]}" down
    ;;
  build)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" build "$SERVICE"
    else
      "${compose_cmd[@]}" build
    fi
    ;;
  push)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" push "$SERVICE"
    else
      "${compose_cmd[@]}" push
    fi
    ;;
  build-push)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" build --push "$SERVICE"
    else
      "${compose_cmd[@]}" build --push
    fi
    ;;
  rebuild)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" build "$SERVICE"
    else
      "${compose_cmd[@]}" build
    fi
    ;;
  restart)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" restart "$SERVICE"
    else
      "${compose_cmd[@]}" down
      check_private_ports
      "${compose_cmd[@]}" up -d --no-build
    fi
    ;;
  pull)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" pull "$SERVICE"
    else
      "${compose_cmd[@]}" pull
    fi
    ;;
  deploy)
    check_private_ports
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" up -d --no-build "$SERVICE"
    else
      "${compose_cmd[@]}" up -d --no-build
    fi
    ;;
  pull-deploy)
    check_private_ports
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" pull "$SERVICE"
      "${compose_cmd[@]}" up -d --no-build "$SERVICE"
    else
      "${compose_cmd[@]}" pull
      "${compose_cmd[@]}" up -d --no-build
    fi
    ;;
  migrate)
    "${compose_cmd[@]}" --profile migrate run --rm db-migration
    ;;
  ps)
    "${compose_cmd[@]}" ps
    ;;
  logs)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" logs -f "$SERVICE"
    else
      "${compose_cmd[@]}" logs -f edge public-site lorne-modulith tenant-portal admin-portal worker-app
    fi
    ;;
  config)
    "${compose_cmd[@]}" config
    ;;
  website-build|website-build-push|website-deploy|website-pull-deploy)
    if [[ -n "$SERVICE" ]]; then
      echo "ERROR: website actions already target public-site and edge; omit the service argument."
      exit 1
    fi
    case "$ACTION" in
      website-build)
        "${compose_cmd[@]}" build public-site edge
        ;;
      website-build-push)
        "${compose_cmd[@]}" build --push public-site edge
        ;;
      website-deploy)
        check_private_ports
        deploy_website
        ;;
      website-pull-deploy)
        check_private_ports
        "${compose_cmd[@]}" pull public-site edge
        deploy_website
        ;;
    esac
    ;;
  *)
    echo "Unsupported action: $ACTION"
    usage
    exit 1
    ;;
esac
