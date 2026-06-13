#!/usr/bin/env bash
# Deprecated: t3code-main is the canonical main worktree. Use t3-launch.sh main.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/t3-launch.sh" main "$@"
