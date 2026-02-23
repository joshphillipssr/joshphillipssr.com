#!/usr/bin/env bash
set -euo pipefail

# cleanup.sh
# Remove a deployed site stack and its generated host directories.
#
# Required:
#   SITE_NAME (or first arg)
#
# Optional:
#   TARGET_DIR      default: /opt/sites
#   SITE_REPO_DIR   optional additional checkout path to remove
#   ENV_FILE        default: <repo-root>/site.env

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
SITE_REPO_DIR="${SITE_REPO_DIR:-}"
SITE_DEPLOY_DIR="${TARGET_DIR}/${SITE_NAME}"

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

echo "==> Cleaning site '${SITE_NAME}'"
echo "    Deploy dir: ${SITE_DEPLOY_DIR}"
if [[ -n "$SITE_REPO_DIR" ]]; then
  echo "    Repo dir:   ${SITE_REPO_DIR}"
fi

if [[ -f "${SITE_DEPLOY_DIR}/docker-compose.yml" ]]; then
  echo "==> Stopping compose stack..."
  docker compose -f "${SITE_DEPLOY_DIR}/docker-compose.yml" down --remove-orphans || true
else
  echo "No compose file found at ${SITE_DEPLOY_DIR}; skipping compose down."
fi

if docker ps -a --format '{{.Names}}' | grep -qx "${SITE_NAME}"; then
  echo "==> Removing container ${SITE_NAME}..."
  docker rm -f "${SITE_NAME}" || true
fi

echo "==> Removing deploy directory: ${SITE_DEPLOY_DIR}"
rm -rf "${SITE_DEPLOY_DIR}"

if [[ -n "$SITE_REPO_DIR" ]]; then
  echo "==> Removing repo directory: ${SITE_REPO_DIR}"
  rm -rf "${SITE_REPO_DIR}"
fi

echo "✅ Site cleanup complete."
