#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
ACTION="${2:-up}"
SERVICE="${3:-}"
PLATFORM="${TARGET_PLATFORM:-${4:-linux/amd64}}"

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
EOF
}

if [[ -z "$MODE" || ("$MODE" != "local" && "$MODE" != "prod") ]]; then
  usage
  exit 1
fi

export DOCKER_DEFAULT_PLATFORM="$PLATFORM"
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
      "${compose_cmd[@]}" logs -f edge lorne-modulith tenant-portal admin-portal worker-app
    fi
    ;;
  config)
    "${compose_cmd[@]}" config
    ;;
  *)
    echo "Unsupported action: $ACTION"
    usage
    exit 1
    ;;
esac
