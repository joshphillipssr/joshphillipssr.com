#!/usr/bin/env bash
set -euo pipefail

# deploy_to_host.sh
# Generate a Traefik-aware compose file for this site and deploy/update it.
#
# Config loading order:
#   1) Existing shell environment
#   2) ENV_FILE (default: <repo-root>/site.env)
#   3) Existing shell environment values are re-applied (explicit override)
#
# Required:
#   SITE_NAME      short identifier for compose/router/service names
#   SITE_HOSTS     space-separated hostnames (example.com www.example.com)
#   SITE_IMAGE     image reference (ghcr.io/owner/repo:latest)
#
# Optional:
#   SITE_PORT      container port served by app (default: 80)
#   TARGET_DIR     host directory for generated compose (default: /opt/sites)
#   NETWORK_NAME   shared Traefik network (default: traefik_proxy)
#   ENTRYPOINTS    Traefik entrypoints (default: websecure)
#   CERT_RESOLVER  Traefik cert resolver (default: cf)
#   MIDDLEWARES    optional comma-separated middleware chain
#   DEPLOY_NOW     true/false (default: true)
#   FORCE          true/false overwrite existing compose (default: false)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/site.env}"

log() { printf "\n==> %s\n" "$*"; }

usage() {
  cat <<EOF
Usage:
  ENV_FILE=/opt/sites/<site>/site.env ${BASH_SOURCE[0]}

Required:
  SITE_NAME
  SITE_HOSTS
  SITE_IMAGE

Optional:
  SITE_PORT=80
  TARGET_DIR=/opt/sites
  NETWORK_NAME=traefik_proxy
  ENTRYPOINTS=websecure
  CERT_RESOLVER=cf
  MIDDLEWARES=
  DEPLOY_NOW=true
  FORCE=false
EOF
}

is_true() {
  case "${1:-}" in
    1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Yy]|[Oo][Nn]) return 0 ;;
    *) return 1 ;;
  esac
}

load_env() {
  # Preserve explicit environment values before sourcing file.
  local pre_site_name="${SITE_NAME-}"
  local pre_site_hosts="${SITE_HOSTS-}"
  local pre_site_image="${SITE_IMAGE-}"
  local pre_site_port="${SITE_PORT-}"
  local pre_target_dir="${TARGET_DIR-}"
  local pre_network_name="${NETWORK_NAME-}"
  local pre_entrypoints="${ENTRYPOINTS-}"
  local pre_cert_resolver="${CERT_RESOLVER-}"
  local pre_middlewares="${MIDDLEWARES-}"
  local pre_deploy_now="${DEPLOY_NOW-}"
  local pre_force="${FORCE-}"

  local has_site_name="${SITE_NAME+x}"
  local has_site_hosts="${SITE_HOSTS+x}"
  local has_site_image="${SITE_IMAGE+x}"
  local has_site_port="${SITE_PORT+x}"
  local has_target_dir="${TARGET_DIR+x}"
  local has_network_name="${NETWORK_NAME+x}"
  local has_entrypoints="${ENTRYPOINTS+x}"
  local has_cert_resolver="${CERT_RESOLVER+x}"
  local has_middlewares="${MIDDLEWARES+x}"
  local has_deploy_now="${DEPLOY_NOW+x}"
  local has_force="${FORCE+x}"

  if [[ -f "$ENV_FILE" ]]; then
    log "Loading config from ${ENV_FILE}"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    log "No ENV_FILE found at ${ENV_FILE}; using shell environment/defaults"
  fi

  if [[ -n "$has_site_name" ]]; then SITE_NAME="$pre_site_name"; fi
  if [[ -n "$has_site_hosts" ]]; then SITE_HOSTS="$pre_site_hosts"; fi
  if [[ -n "$has_site_image" ]]; then SITE_IMAGE="$pre_site_image"; fi
  if [[ -n "$has_site_port" ]]; then SITE_PORT="$pre_site_port"; fi
  if [[ -n "$has_target_dir" ]]; then TARGET_DIR="$pre_target_dir"; fi
  if [[ -n "$has_network_name" ]]; then NETWORK_NAME="$pre_network_name"; fi
  if [[ -n "$has_entrypoints" ]]; then ENTRYPOINTS="$pre_entrypoints"; fi
  if [[ -n "$has_cert_resolver" ]]; then CERT_RESOLVER="$pre_cert_resolver"; fi
  if [[ -n "$has_middlewares" ]]; then MIDDLEWARES="$pre_middlewares"; fi
  if [[ -n "$has_deploy_now" ]]; then DEPLOY_NOW="$pre_deploy_now"; fi
  if [[ -n "$has_force" ]]; then FORCE="$pre_force"; fi
}

apply_defaults() {
  SITE_PORT="${SITE_PORT:-80}"
  TARGET_DIR="${TARGET_DIR:-/opt/sites}"
  NETWORK_NAME="${NETWORK_NAME:-traefik_proxy}"
  ENTRYPOINTS="${ENTRYPOINTS:-websecure}"
  CERT_RESOLVER="${CERT_RESOLVER:-cf}"
  MIDDLEWARES="${MIDDLEWARES:-}"
  DEPLOY_NOW="${DEPLOY_NOW:-true}"
  FORCE="${FORCE:-false}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

validate_inputs() {
  if [[ -z "${SITE_NAME:-}" || -z "${SITE_HOSTS:-}" || -z "${SITE_IMAGE:-}" ]]; then
    usage >&2
    exit 1
  fi

  if [[ ! "${SITE_NAME:-}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "SITE_NAME must match ^[a-z0-9][a-z0-9-]*$ (got: ${SITE_NAME})" >&2
    exit 1
  fi

  if [[ ! "${SITE_PORT:-}" =~ ^[0-9]+$ ]]; then
    echo "SITE_PORT must be numeric (got: ${SITE_PORT})" >&2
    exit 1
  fi

  # shellcheck disable=SC2206
  SITE_HOSTS_ARRAY=($SITE_HOSTS)
  if [[ ${#SITE_HOSTS_ARRAY[@]} -eq 0 ]]; then
    echo "SITE_HOSTS must include at least one hostname." >&2
    exit 1
  fi

  local host
  for host in "${SITE_HOSTS_ARRAY[@]}"; do
    if [[ ! "$host" =~ ^[A-Za-z0-9.-]+$ ]]; then
      echo "Invalid hostname in SITE_HOSTS: ${host}" >&2
      exit 1
    fi
  done
}

ensure_docker() {
  require_cmd docker
  if ! docker info >/dev/null 2>&1; then
    echo "Cannot reach Docker daemon. Use a user with docker access (usually deploy)." >&2
    exit 1
  fi
}

ensure_network() {
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "Docker network '${NETWORK_NAME}' not found." >&2
    echo "Create it from Traefik-Deployment (example):" >&2
    echo "  NETWORK_NAME=${NETWORK_NAME} /opt/traefik/scripts/create_network.sh" >&2
    exit 1
  fi
}

write_compose() {
  local site_dir="${TARGET_DIR}/${SITE_NAME}"
  local compose_file="${site_dir}/docker-compose.yml"
  local rule_hosts=""
  local middleware_label=""
  local host

  if [[ -f "$compose_file" ]] && ! is_true "$FORCE"; then
    echo "Compose file already exists at ${compose_file}." >&2
    echo "Set FORCE=true to overwrite." >&2
    exit 1
  fi

  for host in "${SITE_HOSTS_ARRAY[@]}"; do
    if [[ -z "$rule_hosts" ]]; then
      rule_hosts="Host(\`${host}\`)"
    else
      rule_hosts="${rule_hosts} || Host(\`${host}\`)"
    fi
  done

  if [[ -n "$MIDDLEWARES" ]]; then
    middleware_label="      - \"traefik.http.routers.${SITE_NAME}.middlewares=${MIDDLEWARES}\""
  fi

  mkdir -p "$site_dir"
  log "Writing ${compose_file}"
  cat >"$compose_file" <<EOF
services:
  ${SITE_NAME}:
    image: ${SITE_IMAGE}
    container_name: ${SITE_NAME}
    restart: unless-stopped
    networks:
      - ${NETWORK_NAME}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${SITE_NAME}.entrypoints=${ENTRYPOINTS}"
      - "traefik.http.routers.${SITE_NAME}.tls=true"
      - "traefik.http.routers.${SITE_NAME}.tls.certresolver=${CERT_RESOLVER}"
      - "traefik.http.routers.${SITE_NAME}.rule=${rule_hosts}"
      - "traefik.http.routers.${SITE_NAME}.service=${SITE_NAME}"
      - "traefik.http.services.${SITE_NAME}.loadbalancer.server.port=${SITE_PORT}"
${middleware_label}

networks:
  ${NETWORK_NAME}:
    external: true
EOF

  COMPOSE_FILE="$compose_file"
  PRIMARY_HOST="${SITE_HOSTS_ARRAY[0]}"
}

validate_compose() {
  docker compose -f "$COMPOSE_FILE" config -q
}

deploy_if_requested() {
  if is_true "$DEPLOY_NOW"; then
    log "Deploying ${SITE_NAME} (DEPLOY_NOW=${DEPLOY_NOW})"
    docker compose -f "$COMPOSE_FILE" pull
    docker compose -f "$COMPOSE_FILE" up -d
    docker compose -f "$COMPOSE_FILE" ps
  else
    log "DEPLOY_NOW=${DEPLOY_NOW}; compose scaffold only"
  fi
}

next_steps() {
  cat <<EOF

✅ Compose ready at:
  ${COMPOSE_FILE}

Manual deploy commands:
  docker compose -f ${COMPOSE_FILE} pull
  docker compose -f ${COMPOSE_FILE} up -d

Verify route:
  curl -I https://${PRIMARY_HOST}
EOF
}

main() {
  load_env
  apply_defaults
  validate_inputs
  ensure_docker
  ensure_network
  write_compose
  validate_compose
  deploy_if_requested
  next_steps
}

main "$@"
