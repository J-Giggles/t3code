#!/usr/bin/env bash
# Snapshot Hyprland monitor/workspace at launch start for later window placement.
set -euo pipefail

INSTANCE="${1:-}"
T3_HOME="${2:-}"

if [[ -z "$INSTANCE" || -z "$T3_HOME" ]]; then
  echo "Usage: $0 <instance> <t3_home>" >&2
  exit 1
fi

if ! command -v hyprctl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$T3_HOME"

MONITOR="$(hyprctl monitors -j 2>/dev/null | jq -r '.[] | select(.focused == true) | .name' | head -n 1)"
MONITOR_ID="$(hyprctl monitors -j 2>/dev/null | jq -r '.[] | select(.focused == true) | .id' | head -n 1)"
WORKSPACE="$(hyprctl activeworkspace -j 2>/dev/null | jq -r '.id // empty')"
WORKSPACE_NAME="$(hyprctl activeworkspace -j 2>/dev/null | jq -r '.name // empty')"
FOCUSED_ADDRESS="$(hyprctl activewindow -j 2>/dev/null | jq -r '.address // empty')"
TIMESTAMP="$(date -Iseconds)"

EXPECT_STARTUP_TERMINAL="true"
if [[ "${T3CODE_DISABLE_STARTUP_TERMINAL:-}" = "1" ]]; then
  EXPECT_STARTUP_TERMINAL="false"
fi

jq -n \
  --arg instance "$INSTANCE" \
  --arg monitor "$MONITOR" \
  --arg monitorId "$MONITOR_ID" \
  --arg workspace "$WORKSPACE" \
  --arg workspaceName "$WORKSPACE_NAME" \
  --arg focusedAddress "$FOCUSED_ADDRESS" \
  --arg timestamp "$TIMESTAMP" \
  --argjson expectStartupTerminal "$([[ "$EXPECT_STARTUP_TERMINAL" = "true" ]] && echo true || echo false)" \
  '{
    instance: $instance,
    monitor: $monitor,
    monitorId: (if ($monitorId | length) > 0 then ($monitorId | tonumber) else null end),
    workspace: (if ($workspace | length) > 0 then ($workspace | tonumber) else null end),
    workspaceName: $workspaceName,
    focusedAddress: $focusedAddress,
    timestamp: $timestamp,
    expectStartupTerminal: $expectStartupTerminal
  }' > "$T3_HOME/launch-context.json"
