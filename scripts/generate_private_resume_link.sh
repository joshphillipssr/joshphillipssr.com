#!/usr/bin/env bash
set -euo pipefail

# generate_private_resume_link.sh
# Generate a signed, expiring URL for the private resume route.
#
# Inputs (precedence: CLI args > environment/site.env > defaults):
#   BASE_URL arg1 or SITE_BASE_URL         (required)
#   TTL arg2 or RESUME_LINK_TTL_SECONDS    (default: 900)
#   ROUTE env RESUME_ROUTE                 (default: /_private/resume)
#   SECRET env RESUME_SIGNING_SECRET       (required)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/site.env}"

usage() {
  cat <<'USAGE'
Usage:
  ENV_FILE=/opt/sites/<site>/site.env scripts/generate_private_resume_link.sh [BASE_URL] [TTL_SECONDS]

Required:
  SITE_BASE_URL or arg1 (example: https://joshphillipssr.com)
  RESUME_SIGNING_SECRET

Optional:
  RESUME_ROUTE=/_private/resume
  RESUME_LINK_TTL_SECONDS=900
USAGE
}

format_utc_timestamp() {
  local ts="$1"

  # BSD date (macOS)
  if date -u -r "$ts" '+%Y-%m-%d %H:%M:%S UTC' >/dev/null 2>&1; then
    date -u -r "$ts" '+%Y-%m-%d %H:%M:%S UTC'
    return
  fi

  # GNU date (Linux)
  if date -u -d "@${ts}" '+%Y-%m-%d %H:%M:%S UTC' >/dev/null 2>&1; then
    date -u -d "@${ts}" '+%Y-%m-%d %H:%M:%S UTC'
    return
  fi

  echo "unsupported date implementation"
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${1:-${SITE_BASE_URL:-}}"
TTL_SECONDS="${2:-${RESUME_LINK_TTL_SECONDS:-900}}"
ROUTE="${RESUME_ROUTE:-/_private/resume}"
SECRET="${RESUME_SIGNING_SECRET:-}"

if [[ -z "$BASE_URL" || -z "$SECRET" ]]; then
  usage >&2
  exit 1
fi

if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
  echo "BASE_URL must start with http:// or https:// (got: ${BASE_URL})" >&2
  exit 1
fi

if [[ ! "$TTL_SECONDS" =~ ^[0-9]+$ ]] || (( TTL_SECONDS < 1 )); then
  echo "TTL_SECONDS must be a positive integer (got: ${TTL_SECONDS})" >&2
  exit 1
fi

if [[ ! "$ROUTE" =~ ^/ ]]; then
  ROUTE="/${ROUTE}"
fi

if [[ "$ROUTE" != "/" && "$ROUTE" == */ ]]; then
  ROUTE="${ROUTE%/}"
fi

NOW_UNIX="$(date +%s)"
EXPIRES_AT="$((NOW_UNIX + TTL_SECONDS))"
PAYLOAD="${ROUTE}:${EXPIRES_AT}"

SIGNATURE="$(
  printf '%s' "$PAYLOAD" \
    | openssl dgst -sha256 -hmac "$SECRET" -binary \
    | openssl base64 -A \
    | tr '+/' '-_' \
    | tr -d '='
)"

SIGNED_URL="${BASE_URL%/}${ROUTE}?exp=${EXPIRES_AT}&sig=${SIGNATURE}"

echo "Signed URL: ${SIGNED_URL}"
echo "Expires (unix): ${EXPIRES_AT}"
echo "Expires (UTC):  $(format_utc_timestamp "${EXPIRES_AT}")"
