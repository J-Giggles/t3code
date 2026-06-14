#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNNER="$WORKSPACE_ROOT/infra/convex-docker/tests/completion/run.mjs"

SUITE="quick"
SLUG="t3code-staging"
SKIP_MANUAL=""
REPORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite) SUITE="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --skip-manual) SKIP_MANUAL=1; shift ;;
    --report) REPORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

ARGS=(--suite "$SUITE" --slug "$SLUG")
[[ -n "$SKIP_MANUAL" ]] && ARGS+=(--skip-manual)
[[ -n "$REPORT" ]] && ARGS+=(--report "$REPORT")

exec node "$RUNNER" "${ARGS[@]}"
