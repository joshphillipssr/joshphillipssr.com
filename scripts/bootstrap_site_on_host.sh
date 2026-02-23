#!/usr/bin/env bash
set -euo pipefail

# bootstrap_site_on_host.sh
# Clone or update a template-derived site repository onto a Traefik host.
#
# Required:
#   SITE_REPO   Git URL for the site repository
#
# Optional:
#   SITE_NAME   short site identifier (default: derived from SITE_REPO)
#   SITE_DIR    target clone directory (default: /opt/sites/<SITE_NAME>)
#   SITE_REF    git branch/tag to sync (default: main)
#   DEPLOY_USER local host user for ownership (default: deploy)
#
# Example:
#   sudo SITE_REPO="https://github.com/<owner>/<repo>.git" \
#        SITE_NAME="docs" \
#        bash -c "$(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/bootstrap_site_on_host.sh)"

SITE_REPO="${SITE_REPO:-}"
SITE_NAME="${SITE_NAME:-}"
SITE_DIR="${SITE_DIR:-}"
SITE_REF="${SITE_REF:-main}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

log() { printf "\n==> %s\n" "$*"; }

usage() {
  cat <<'EOF'
Missing required input.

Required:
  SITE_REPO=<git-url>

Optional:
  SITE_NAME=<short-name>
  SITE_DIR=/opt/sites/<short-name>
  SITE_REF=main
  DEPLOY_USER=deploy
EOF
}

need_root() {
  if [[ $EUID -eq 0 ]]; then
    return
  fi

  if [[ -n "${BASH_SOURCE[0]:-}" && -r "${BASH_SOURCE[0]}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
    log "Re-executing with sudo"
    exec sudo --preserve-env=SITE_REPO,SITE_NAME,SITE_DIR,SITE_REF,DEPLOY_USER "${BASH_SOURCE[0]}" "$@"
  fi

  cat >&2 <<'EOF'
This script needs root privileges.

Run it like this:
  sudo SITE_REPO="https://github.com/<owner>/<repo>.git" \
       SITE_NAME="<site-name>" \
       bash -c "$(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/bootstrap_site_on_host.sh)"
EOF
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

derive_defaults() {
  if [[ -z "$SITE_REPO" ]]; then
    usage >&2
    exit 1
  fi

  if [[ -z "$SITE_NAME" ]]; then
    SITE_NAME="$(basename "${SITE_REPO%.git}")"
  fi

  if [[ -z "$SITE_DIR" ]]; then
    SITE_DIR="/opt/sites/${SITE_NAME}"
  fi
}

sync_repo() {
  if [[ -d "$SITE_DIR/.git" ]]; then
    log "Updating repository in ${SITE_DIR}"
    git -C "$SITE_DIR" fetch --all --prune
    git -C "$SITE_DIR" switch -q "$SITE_REF" 2>/dev/null || git -C "$SITE_DIR" switch -q -c "$SITE_REF" "origin/$SITE_REF"
    git -C "$SITE_DIR" pull --ff-only origin "$SITE_REF"
  else
    log "Cloning ${SITE_REPO} into ${SITE_DIR}"
    mkdir -p "$(dirname "$SITE_DIR")"
    git clone --branch "$SITE_REF" "$SITE_REPO" "$SITE_DIR"
  fi
}

set_permissions() {
  chmod +x "$SITE_DIR"/scripts/*.sh || true

  if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SITE_DIR"
  else
    log "DEPLOY_USER '${DEPLOY_USER}' not found; leaving current ownership"
  fi
}

bootstrap_env() {
  local example_env="${SITE_DIR}/site.env.example"
  local active_env="${SITE_DIR}/site.env"

  if [[ -f "$example_env" && ! -f "$active_env" ]]; then
    log "Creating ${active_env} from site.env.example"
    cp "$example_env" "$active_env"
    chmod 600 "$active_env"
    if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
      chown "$DEPLOY_USER:$DEPLOY_USER" "$active_env"
    fi
  fi
}

next_steps() {
  cat <<EOF

✅ Site repository is ready at:
  ${SITE_DIR}

Next:
  1) Edit ${SITE_DIR}/site.env
  2) Deploy:
     ENV_FILE=${SITE_DIR}/site.env ${SITE_DIR}/scripts/deploy_to_host.sh
EOF
}

main() {
  need_root "$@"
  derive_defaults
  require_cmd git
  sync_repo
  set_permissions
  bootstrap_env
  next_steps
}

main "$@"
