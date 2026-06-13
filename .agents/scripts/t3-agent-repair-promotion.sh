#!/usr/bin/env bash
# Spawn a Cursor agent to repair promotion relaunch failures (reads promotion-repair-agent-request.json).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T3CODE_LOCAL_WORKSPACE="${T3CODE_LOCAL_WORKSPACE:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
T3_HOME="${T3CODE_HOME:-$HOME/.local/share/t3code-local/main}"
REQUEST_FILE="$T3_HOME/promotion-repair-agent-request.json"
LOG_FILE="$T3_HOME/logs/promotion-repair-agent.log"

mkdir -p "$(dirname "$LOG_FILE")"

if [[ ! -f "$REQUEST_FILE" ]]; then
  exit 0
fi

{
  echo "=== promotion repair agent $(date -Iseconds) ==="
  if command -v jq >/dev/null 2>&1; then
    jq -r '.prompt // empty' "$REQUEST_FILE" | head -40
  else
    head -20 "$REQUEST_FILE"
  fi
} >>"$LOG_FILE"

PROMPT=""
if command -v jq >/dev/null 2>&1; then
  PROMPT="$(jq -r '.prompt // empty' "$REQUEST_FILE")"
fi

if [[ -z "$PROMPT" ]]; then
  echo "Missing prompt in $REQUEST_FILE" >>"$LOG_FILE"
  exit 1
fi

SKILL_PATH="$T3CODE_LOCAL_WORKSPACE/.cursor/skills/promotion-stack-repair/SKILL.md"
WRAPPED_PROMPT="Use skill at $SKILL_PATH if present.

$PROMPT"

if command -v cursor >/dev/null 2>&1; then
  if cursor agent --help >/dev/null 2>&1; then
    echo "Launching: cursor agent (detached)" >>"$LOG_FILE"
    nohup cursor agent --workspace "$T3CODE_LOCAL_WORKSPACE/t3code-staging" --prompt "$WRAPPED_PROMPT" \
      >>"$LOG_FILE" 2>&1 &
    rm -f "$REQUEST_FILE"
    exit 0
  fi
fi

echo "Cursor agent CLI unavailable; leaving request at $REQUEST_FILE for manual pickup." >>"$LOG_FILE"
echo "Open Cursor on $T3CODE_LOCAL_WORKSPACE/t3code-staging and run skill: promotion-stack-repair" >>"$LOG_FILE"
exit 0
