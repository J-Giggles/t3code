#!/usr/bin/env bash
# Move T3 launch windows to the snapshotted monitor/workspace and group them as Hyprland tabs.
set -euo pipefail

INSTANCE="${1:-}"
T3_HOME="${2:-}"
TIMEOUT_SEC="${3:-300}"

if [[ -z "$INSTANCE" || -z "$T3_HOME" ]]; then
  echo "Usage: $0 <instance> <t3_home> [timeout_sec]" >&2
  exit 1
fi

if ! command -v hyprctl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

CONTEXT_FILE="$T3_HOME/launch-context.json"
LOG_FILE="$T3_HOME/logs/hypr-placement.log"
WATCHER_PID_FILE="$T3_HOME/placement-watcher.pid"
GROUP_SPECIAL="special:t3code-${INSTANCE}"
mkdir -p "$T3_HOME/logs"

log() {
  printf '[%s] %s\n' "$(date +%H:%M:%S)" "$1" >> "$LOG_FILE"
}

cleanup() {
  [[ -n "${EVENT_PID:-}" ]] && kill "$EVENT_PID" 2>/dev/null || true
  rm -f "$WATCHER_PID_FILE"
}

trap cleanup EXIT

dispatch() {
  local output
  if ! output="$(hyprctl -q dispatch "$@" 2>&1)"; then
    log "dispatch failed ($*): ${output:-unknown error}"
    return 1
  fi

  if [[ -n "$output" && "$output" != ok ]]; then
    log "dispatch note ($*): $output"
    return 1
  fi

  return 0
}

clients_json() {
  hyprctl clients -j 2>/dev/null || echo '[]'
}

if [[ ! -f "$CONTEXT_FILE" ]]; then
  log "missing launch context: $CONTEXT_FILE"
  exit 0
fi

MONITOR="$(jq -r '.monitor // empty' "$CONTEXT_FILE")"
MONITOR_ID="$(jq -r '.monitorId // empty' "$CONTEXT_FILE")"
WORKSPACE="$(jq -r '.workspace // empty' "$CONTEXT_FILE")"
WORKSPACE_NAME="$(jq -r '.workspaceName // empty' "$CONTEXT_FILE")"
FOCUSED_ADDRESS="$(jq -r '.focusedAddress // empty' "$CONTEXT_FILE")"
EXPECT_STARTUP_TERMINAL="$(jq -r '.expectStartupTerminal // true' "$CONTEXT_FILE")"
STARTUP_TITLE_PATTERN='^T3code( (Dev|Staging))? Startup$'
APP_CLASS_PATTERN='^T3code.*'

DEADLINE=$((SECONDS + TIMEOUT_SEC))
DONE=""
MERGE_ATTEMPTED=0

expected_count() {
  if [[ "$EXPECT_STARTUP_TERMINAL" = "true" ]]; then
    echo 3
  else
    echo 2
  fi
}

window_kind() {
  local class="$1"
  local title="$2"

  if [[ "$class" =~ ^(com\.mitchellh\.ghostty|Alacritty|kitty|foot|xterm|org\.gnome\.Terminal)$ ]] \
    && [[ "$title" =~ $STARTUP_TITLE_PATTERN ]]; then
    echo "startup-terminal"
    return 0
  fi

  if [[ "$class" = "$INSTANCE" || "$class" =~ $APP_CLASS_PATTERN || "$class" =~ ^t3code-local-(main|staging)$ ]]; then
    if [[ "$title" =~ [Dd]ev([Tt]ools|eloper Tools) ]]; then
      echo "devtools"
      return 0
    fi
    echo "app"
    return 0
  fi

  echo ""
}

list_t3_windows() {
  clients_json | jq -r '.[] | [.address, .class, .title] | @tsv' | while IFS=$'\t' read -r address class title; do
    [[ -z "$address" ]] && continue
    kind="$(window_kind "$class" "$title")"
    [[ -z "$kind" ]] && continue
    if [[ "$kind" = "startup-terminal" && "$EXPECT_STARTUP_TERMINAL" != "true" ]]; then
      continue
    fi
    printf '%s\t%s\t%s\n' "$address" "$kind" "$title"
  done
}

window_workspace_id() {
  local address="$1"
  clients_json | jq -r --arg addr "$address" '.[] | select(.address == $addr) | .workspace.id // empty'
}

window_monitor_id() {
  local address="$1"
  clients_json | jq -r --arg addr "$address" '.[] | select(.address == $addr) | .monitor // empty'
}

is_floating() {
  local address="$1"
  clients_json | jq -e --arg addr "$address" '.[] | select(.address == $addr) | .floating == true' >/dev/null
}

is_on_anchor() {
  local address="$1"
  local ws monitor

  ws="$(window_workspace_id "$address")"
  if [[ -z "$ws" || "$ws" = "null" ]]; then
    return 1
  fi

  if [[ -n "$WORKSPACE" && "$WORKSPACE" != "null" && "$ws" != "$WORKSPACE" ]]; then
    return 1
  fi

  if [[ -n "$MONITOR_ID" && "$MONITOR_ID" != "null" ]]; then
    monitor="$(window_monitor_id "$address")"
    if [[ -n "$monitor" && "$monitor" != "$MONITOR_ID" ]]; then
      return 1
    fi
  fi

  return 0
}

grouped_members() {
  local address="$1"
  clients_json | jq -r --arg addr "$address" '.[] | select(.address == $addr) | .grouped[]?'
}

grouped_member_count() {
  local address="$1"
  grouped_members "$address" | sort -u | wc -l | tr -d '[:space:]'
}

shares_group_with() {
  local left="$1"
  local right="$2"
  grouped_members "$left" | grep -qx "$right"
}

t3_group_member_count() {
  local max=0 count address

  while IFS=$'\t' read -r address _kind _title; do
    [[ -z "$address" ]] && continue
    count="$(grouped_member_count "$address")"
    if (( count > max )); then
      max=$count
    fi
  done < <(list_t3_windows)

  echo "$max"
}

move_to_anchor() {
  local address="$1"
  local moved=0

  if [[ -n "$WORKSPACE" && "$WORKSPACE" != "null" ]]; then
    if dispatch movetoworkspacesilent "${WORKSPACE},address:${address}"; then
      moved=1
    elif [[ -n "$WORKSPACE_NAME" && "$WORKSPACE_NAME" != "null" ]]; then
      dispatch movetoworkspacesilent "name:${WORKSPACE_NAME},address:${address}" && moved=1 || true
    fi
  fi

  if [[ -n "$MONITOR" ]] || [[ -n "$MONITOR_ID" && "$MONITOR_ID" != "null" ]]; then
    dispatch focuswindow "address:${address}" || true
    if [[ -n "$MONITOR" ]] && dispatch movewindow "mon:${MONITOR} silent"; then
      moved=1
    elif [[ -n "$MONITOR_ID" && "$MONITOR_ID" != "null" ]] && dispatch movewindow "mon:${MONITOR_ID} silent"; then
      moved=1
    fi
  fi

  [[ "$moved" -eq 1 ]]
}

pick_group_anchor() {
  local address kind title

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    if [[ "$kind" = "startup-terminal" ]]; then
      echo "$address"
      return 0
    fi
  done < <(list_t3_windows)

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    if [[ "$kind" = "app" ]]; then
      echo "$address"
      return 0
    fi
  done < <(list_t3_windows)

  list_t3_windows | head -n 1 | cut -f1
}

merge_into_group_from_focus() {
  local anchor="$1"
  local address="$2"
  local direction

  if shares_group_with "$address" "$anchor"; then
    return 0
  fi

  dispatch focuswindow "address:${address}" || true
  for direction in d u r l; do
    dispatch moveintogroup "${direction}" || true
    if shares_group_with "$address" "$anchor"; then
      return 0
    fi
  done

  return 1
}

merge_t3_tab_group() {
  local expected anchor address kind title moved=0 merged=0

  expected="$(expected_count)"
  if [[ "$(t3_group_member_count)" -ge "$expected" ]]; then
    return 0
  fi

  MERGE_ATTEMPTED=1
  anchor="$(pick_group_anchor)"
  if [[ -z "$anchor" ]]; then
    log "group merge skipped: no T3 windows found"
    return 1
  fi

  log "group merge via ${GROUP_SPECIAL} (anchor ${anchor})"

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    if is_floating "$address"; then
      dispatch focuswindow "address:${address}" || true
      dispatch togglefloating || true
    fi
    if dispatch movetoworkspacesilent "${GROUP_SPECIAL},address:${address}"; then
      moved=$((moved + 1))
    fi
  done < <(list_t3_windows)

  sleep 0.15

  dispatch focuswindow "address:${anchor}" || true
  dispatch lockactivegroup toggle || true
  if [[ "$(grouped_member_count "$anchor")" -le 1 ]]; then
    dispatch togglegroup "address:${anchor}" || true
  fi
  dispatch lockactivegroup toggle || true

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    [[ "$address" = "$anchor" ]] && continue
    if merge_into_group_from_focus "$anchor" "$address"; then
      merged=$((merged + 1))
      log "merged ${address} (${kind}) into T3 tab group"
    else
      log "could not merge ${address} (${kind}) into T3 tab group"
    fi
  done < <(list_t3_windows)

  dispatch focuswindow "address:${anchor}" || true
  dispatch lockactivegroup toggle || true

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    move_to_anchor "$address" || true
  done < <(list_t3_windows)

  log "group merge finished (moved ${moved} to special, merged ${merged}, size ${expected} windows)"
  [[ "$(t3_group_member_count)" -ge "$expected" ]]
}

count_on_anchor() {
  local count=0
  local address kind title

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue
    if is_on_anchor "$address"; then
      count=$((count + 1))
    fi
  done < <(list_t3_windows)

  echo "$count"
}

restore_launch_focus() {
  if [[ -z "$FOCUSED_ADDRESS" ]]; then
    return 0
  fi

  dispatch focuswindow "address:${FOCUSED_ADDRESS}" || true
  log "restored focus to ${FOCUSED_ADDRESS}"
}

finish_if_complete() {
  local on_anchor expected group_size

  on_anchor="$(count_on_anchor)"
  expected="$(expected_count)"
  group_size="$(t3_group_member_count)"

  if [[ "$on_anchor" -lt "$expected" ]]; then
    return 1
  fi

  if [[ "$group_size" -lt "$expected" && "$MERGE_ATTEMPTED" -eq 0 ]]; then
    merge_t3_tab_group || true
    group_size="$(t3_group_member_count)"
  fi

  if [[ "$on_anchor" -ge "$expected" && "$group_size" -ge "$expected" ]]; then
    restore_launch_focus
    log "all ${on_anchor}/${expected} T3 windows on ${MONITOR} workspace ${WORKSPACE}, tab group size ${group_size}; done"
    DONE=1
    return 0
  fi

  return 1
}

process_clients() {
  local address kind title ws

  while IFS=$'\t' read -r address kind title; do
    [[ -z "$address" ]] && continue

    if is_on_anchor "$address"; then
      continue
    fi

    ws="$(window_workspace_id "$address")"
    if move_to_anchor "$address"; then
      if is_on_anchor "$address"; then
        log "moved ${address} (${kind}) to ${MONITOR} workspace ${WORKSPACE} (was ws ${ws:-?})"
      else
        log "move dispatch ok but ${address} (${kind}) still on ws $(window_workspace_id "$address") (wanted ${WORKSPACE})"
      fi
    else
      log "failed to move ${address} (${kind}) from ws ${ws:-?} to workspace ${WORKSPACE}"
    fi
  done < <(list_t3_windows)

  finish_if_complete || true
}

start_openwindow_listener() {
  local signature socket_path

  if ! command -v socat >/dev/null 2>&1; then
    return 0
  fi

  signature="$(hyprctl -j instances 2>/dev/null | jq -r '.[0].instance // empty')"
  socket_path="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/hypr/${signature}/.socket2.sock"

  if [[ -z "$signature" || ! -S "$socket_path" ]]; then
    return 0
  fi

  (
    socat -u "UNIX-CONNECT:${socket_path}" - 2>/dev/null | while read -r line; do
      case "$line" in
        openwindow* | openwindowv2*)
          process_clients
          [[ -n "$DONE" ]] && break
          ;;
      esac
    done
  ) &
  EVENT_PID=$!
}

log "placement watcher $$ started for ${INSTANCE} (timeout ${TIMEOUT_SEC}s, anchor ${MONITOR} ws ${WORKSPACE})"

start_openwindow_listener
process_clients
[[ -n "$DONE" ]] && exit 0

while [[ "$SECONDS" -lt "$DEADLINE" && -z "$DONE" ]]; do
  process_clients
  [[ -n "$DONE" ]] && exit 0
  sleep 0.1
done

if [[ "$(count_on_anchor)" -ge "$(expected_count)" && "$(t3_group_member_count)" -lt "$(expected_count)" ]]; then
  merge_t3_tab_group || true
fi

restore_launch_focus
log "timed out with $(count_on_anchor)/$(expected_count) on anchor, tab group size $(t3_group_member_count)"
exit 0
