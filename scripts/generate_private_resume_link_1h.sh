#!/usr/bin/env bash
set -euo pipefail

# generate_private_resume_link_1h.sh
# Generate a signed private resume link with a fixed 1-hour TTL.
#
# Usage:
#   scripts/generate_private_resume_link_1h.sh [BASE_URL]
#
# Notes:
# - Uses ENV_FILE from the environment when provided.
# - Defaults ENV_FILE to <repo>/site.env.
# - Delegates signing and route handling to generate_private_resume_link.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export ENV_FILE="${ENV_FILE:-${REPO_ROOT}/site.env}"

exec "${SCRIPT_DIR}/generate_private_resume_link.sh" "${1:-}" 3600
