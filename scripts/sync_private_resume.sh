#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LOCAL_RESUME_FILE="${LOCAL_RESUME_FILE:-$REPO_ROOT/private/resume.md}"
REMOTE_HOST="${REMOTE_HOST:-deploy@neo.cfhidta.net}"
REMOTE_SITE_DIR="${REMOTE_SITE_DIR:-/opt/sites/joshphillipssr-com}"
REMOTE_RESUME_FILE="${REMOTE_RESUME_FILE:-$REMOTE_SITE_DIR/private/private-resume.md}"
REMOTE_TMP_FILE="${REMOTE_TMP_FILE:-$REMOTE_RESUME_FILE.new}"

usage() {
	cat <<EOF
Usage: $(basename "$0")

Sync private/resume.md to Neo using an in-place write on the mounted host file.

Defaults:
  LOCAL_RESUME_FILE=$LOCAL_RESUME_FILE
  REMOTE_HOST=$REMOTE_HOST
  REMOTE_RESUME_FILE=$REMOTE_RESUME_FILE

Overrides:
  LOCAL_RESUME_FILE=/path/to/resume.md
  REMOTE_HOST=user@host
  REMOTE_SITE_DIR=/opt/sites/site-name
  REMOTE_RESUME_FILE=/opt/sites/site-name/private/private-resume.md
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
	usage
	exit 0
fi

if [ ! -f "$LOCAL_RESUME_FILE" ]; then
	echo "error: local resume file not found: $LOCAL_RESUME_FILE" >&2
	exit 1
fi

local_hash="$(sha256sum "$LOCAL_RESUME_FILE" | awk '{print $1}')"

scp -o BatchMode=yes "$LOCAL_RESUME_FILE" "$REMOTE_HOST:$REMOTE_TMP_FILE"
remote_hash="$(
	ssh -o BatchMode=yes "$REMOTE_HOST" \
		"cat '$REMOTE_TMP_FILE' > '$REMOTE_RESUME_FILE' && chmod 600 '$REMOTE_RESUME_FILE' && rm -f '$REMOTE_TMP_FILE' && sha256sum '$REMOTE_RESUME_FILE'" \
		| awk '{print $1}'
)"

printf 'local=%s\nremote=%s\n' "$local_hash" "$remote_hash"
