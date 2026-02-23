#!/usr/bin/env bash
set -euo pipefail

# update_site.sh
# Pull the latest image for a deployed site and restart via docker compose.
#
# Required:
#   SITE_NAME (or pass as first argument)
#
# Optional:
#   TARGET_DIR (default: /opt/sites)
#   ENV_FILE   (default: <repo-root>/site.env)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/site.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SITE_NAME="${SITE_NAME:-${1:-}}"
TARGET_DIR="${TARGET_DIR:-/opt/sites}"

if [[ -z "$SITE_NAME" ]]; then
  echo "SITE_NAME is required (env or first arg)." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing required command: docker" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot reach Docker daemon. Use a user with docker access." >&2
  exit 1
fi

SITE_DIR="${TARGET_DIR}/${SITE_NAME}"
COMPOSE_FILE="${SITE_DIR}/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

echo "==> Updating ${SITE_NAME}"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d
docker compose -f "$COMPOSE_FILE" ps
echo "✅ ${SITE_NAME} updated successfully."
