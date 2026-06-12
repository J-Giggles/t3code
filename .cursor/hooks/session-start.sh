#!/usr/bin/env bash
# Refreshes .context on session start and injects workspace orientation for agents.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REFRESH_SCRIPT="$ROOT/.agents/scripts/refresh-project-context.sh"
REFRESH_LOG="$ROOT/.context/refresh.log"
INDEX_FILE="$ROOT/.context/index.md"
DOCS_FILE="$ROOT/.context/docs.md"

escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# Fire-and-forget context refresh (sessionStart is not blocked on this).
if [[ -x "$REFRESH_SCRIPT" ]]; then
  mkdir -p "$ROOT/.context"
  (
    echo "=== $(date -Iseconds) sessionStart refresh ===" >>"$REFRESH_LOG"
    "$REFRESH_SCRIPT" >>"$REFRESH_LOG" 2>&1 || true
  ) &
fi

summary="T3 Code Local workspace at $ROOT. "
summary+="Main app: t3code-main/ (branch main). Staging dev: t3code-staging/ (branch staging). "
summary+="Launch for agents: .agents/scripts/t3-launch.sh main|staging --wait. "
summary+="Verify UI: .agents/scripts/t3-verify.sh main|staging. "
summary+="Electron CDP when T3CODE_AGENT_AUTOMATION=1: main port 9222, staging port 9232. "
summary+="Read AGENTS.md and .context/index.md."

if [[ -f "$INDEX_FILE" ]]; then
  index_excerpt="$(head -c 2400 "$INDEX_FILE" 2>/dev/null || true)"
  if [[ -n "$index_excerpt" ]]; then
    summary+="\n\n--- .context/index.md (excerpt) ---\n${index_excerpt}"
  fi
fi

if [[ -f "$DOCS_FILE" ]]; then
  docs_excerpt="$(grep -E '^(Last refreshed|## Omarchy|## Dev ports|## Seeing)' "$DOCS_FILE" 2>/dev/null | head -20 || true)"
  if [[ -n "$docs_excerpt" ]]; then
    summary+="\n\n--- .context/docs.md (key lines) ---\n${docs_excerpt}"
  fi
fi

summary_escaped="$(escape_for_json "$summary")"

printf '{\n  "continue": true,\n  "env": {\n    "T3CODE_LOCAL_WORKSPACE": "%s",\n    "T3CODE_AGENT_AUTOMATION": "1"\n  },\n  "additional_context": "%s"\n}\n' \
  "$ROOT" \
  "$summary_escaped"

exit 0
