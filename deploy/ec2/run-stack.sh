#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-local}"
ACTION="${2:-up}"
SERVICE="${3:-}"

usage() {
  printf '%s\n' "Usage: ./run-stack.sh <local|prod> <up|down|rebuild|restart|migrate|ps|logs|config> [service]"
}

if [[ "$MODE" != "local" && "$MODE" != "prod" ]]; then
  usage
  exit 1
fi

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
    /^  (lorne-modulith|postgres|redis):$/ {
      svc=$1
      gsub(":", "", svc)
      in_target=1
      next
    }
    /^  [^[:space:]].*:$/ {
      if ($0 !~ /^  (lorne-modulith|postgres|redis):$/) {
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
  rebuild)
    check_private_ports
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" up -d --build --force-recreate "$SERVICE"
    else
      "${compose_cmd[@]}" up -d --build --force-recreate
    fi
    ;;
  restart)
    if [[ -n "$SERVICE" ]]; then
      "${compose_cmd[@]}" restart "$SERVICE"
    else
      "${compose_cmd[@]}" restart
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
    usage
    exit 1
    ;;
esac
