#!/usr/bin/env bash
# Regenerate .context support files for the t3code-local workspace (CCS workflow).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CCS_SKILL="${HOME}/.cursor/skills/codebase-context-specification"
CONTEXT_DIR="$ROOT/.context"
STAMP="$(date +%Y-%m-%dT%H:%M:%S%z)"

mkdir -p "$CONTEXT_DIR/diagrams"

run_python() {
  local script="$1"
  shift
  if [[ ! -f "$script" ]]; then
    echo "Missing CCS script: $script" >&2
    exit 1
  fi
  python3 "$script" "$@"
}

echo "Refreshing workspace context at $CONTEXT_DIR"

if [[ -d "$CCS_SKILL/scripts" ]]; then
  run_python "$CCS_SKILL/scripts/generate-filesystem-map.py" "$ROOT" --max-depth 3 \
    >"$CONTEXT_DIR/filesystem-map.md" || echo "# filesystem-map generation failed" >"$CONTEXT_DIR/filesystem-map.md"

  run_python "$CCS_SKILL/scripts/generate-inputs-and-state.py" "$ROOT/t3code" \
    >"$CONTEXT_DIR/inputs-and-state-t3code.md" 2>/dev/null || true

  run_python "$CCS_SKILL/scripts/generate-inputs-and-state.py" "$ROOT/t3code-staging" \
    >"$CONTEXT_DIR/inputs-and-state-t3code-staging.md" 2>/dev/null || true

  if [[ -f "$CONTEXT_DIR/index.md" ]]; then
    run_python "$CCS_SKILL/scripts/generate-functions-and-flows.py" "$ROOT" \
      >"$CONTEXT_DIR/functions-and-flows.md" 2>/dev/null || true
  fi
else
  echo "CCS skill not found at $CCS_SKILL — skipping Python generators." >&2
fi

if [[ -f "$CONTEXT_DIR/docs.md" ]]; then
  if grep -q 'Last refreshed:' "$CONTEXT_DIR/docs.md" 2>/dev/null; then
    sed -i "s/^Last refreshed:.*/Last refreshed: $STAMP/" "$CONTEXT_DIR/docs.md"
  else
    printf '\nLast refreshed: %s\n' "$STAMP" >>"$CONTEXT_DIR/docs.md"
  fi
fi

echo "Done. Read $CONTEXT_DIR/index.md"
