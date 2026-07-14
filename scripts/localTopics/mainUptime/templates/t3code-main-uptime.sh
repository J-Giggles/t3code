#!/usr/bin/env bash
set -euo pipefail

ROOT="${T3CODE_MAIN_ROOT:-@@REPO_ROOT@@}"
STATE_DIR="${T3CODE_MAIN_UPTIME_STATE_DIR:-@@HOME_DIR@@/.local/state/t3code-main-uptime}"
APPROVED_FILE="$STATE_DIR/approved-head"
LOCK_FILE="$STATE_DIR/promotion.lock"
PROOF_FILE="$STATE_DIR/main-public-proof"
LAST_PROOF_FILE="$STATE_DIR/last-approved-main-public-proof"
STARTED_FILE="$STATE_DIR/main-started-at"
HEALTH_FAILURE_FILE="$STATE_DIR/health-failures"
INCIDENT_DIR="$STATE_DIR/incidents"
HEALTH_URL="${T3CODE_MAIN_HEALTH_URL:-https://giggabit-server.tailfb378a.ts.net/main/api/auth/session}"
LOCAL_HEALTH_URL="${T3CODE_MAIN_LOCAL_HEALTH_URL:-http://127.0.0.1:13793/main/api/auth/session}"
HEALTH_FAILURE_THRESHOLD="${T3CODE_MAIN_HEALTH_FAILURE_THRESHOLD:-3}"
HEALTH_STARTUP_GRACE_SECONDS="${T3CODE_MAIN_HEALTH_STARTUP_GRACE_SECONDS:-120}"
GIT="${T3CODE_MAIN_UPTIME_GIT:-/usr/bin/git}"
SYSTEMCTL="${T3CODE_MAIN_UPTIME_SYSTEMCTL:-systemctl}"
CURL="${T3CODE_MAIN_UPTIME_CURL:-curl}"
TAILSCALE_RECONCILE="${T3CODE_MAIN_TAILSCALE_RECONCILE:-@@HOME_DIR@@/.local/bin/t3code-tailscale-reconcile}"

die() {
  echo "t3code-main-uptime: $*" >&2
  exit 1
}

fail() {
  echo "t3code-main-uptime: $*" >&2
  return 1
}

read_approved() {
  [[ -f "$APPROVED_FILE" ]] || die "missing approved head at $APPROVED_FILE; run initialize"
  local approved
  approved="$(tr -d '[:space:]' <"$APPROVED_FILE")"
  [[ "$approved" =~ ^[0-9a-f]{40}$ ]] || die "invalid approved head in $APPROVED_FILE"
  "$GIT" -C "$ROOT" cat-file -e "$approved^{commit}" 2>/dev/null ||
    die "approved commit $approved is unavailable in $ROOT"
  printf '%s\n' "$approved"
}

atomic_write() {
  local path="$1"
  local value="$2"
  local temp
  mkdir -p "$(dirname "$path")"
  temp="${path}.tmp.$$"
  printf '%s\n' "$value" >"$temp"
  chmod 0600 "$temp"
  mv -f "$temp" "$path"
}

operation_in_progress() {
  local git_dir
  git_dir="$("$GIT" -C "$ROOT" rev-parse --absolute-git-dir)"
  [[ -e "$git_dir/MERGE_HEAD" ]] ||
    [[ -e "$git_dir/CHERRY_PICK_HEAD" ]] ||
    [[ -e "$git_dir/REBASE_HEAD" ]] ||
    [[ -d "$git_dir/rebase-merge" ]] ||
    [[ -d "$git_dir/rebase-apply" ]] ||
    [[ -d "$git_dir/sequencer" ]]
}

checkout_is_clean() {
  [[ -z "$("$GIT" -C "$ROOT" status --porcelain=v1 --untracked-files=all)" ]] &&
    [[ -z "$("$GIT" -C "$ROOT" ls-files -u)" ]] &&
    ! operation_in_progress
}

preflight() {
  local approved branch head
  approved="$(read_approved)"
  branch="$("$GIT" -C "$ROOT" branch --show-current)"
  head="$("$GIT" -C "$ROOT" rev-parse HEAD)"
  [[ "$branch" == "main" ]] || {
    fail "live checkout is on ${branch:-detached HEAD}, expected main"
    return 1
  }
  [[ "$head" == "$approved" ]] || {
    fail "live HEAD $head does not match approved HEAD $approved"
    return 1
  }
  checkout_is_clean || {
    fail "live Main checkout is dirty or has an interrupted Git operation"
    return 1
  }
}

launch_preflight() {
  if preflight >/dev/null 2>&1; then
    return 0
  fi
  promotion_lock_active || return 1
  local values candidate _started _expires branch head
  values="$(lock_values)"
  read -r candidate _started _expires <<<"$values"
  branch="$("$GIT" -C "$ROOT" branch --show-current)"
  head="$("$GIT" -C "$ROOT" rev-parse HEAD)"
  [[ "$branch" == "main" ]] || {
    fail "promotion launch is not on main"
    return 1
  }
  [[ "$head" == "$candidate" ]] || {
    fail "promotion launch HEAD $head does not match locked SHA $candidate"
    return 1
  }
  checkout_is_clean || {
    fail "promotion launch checkout is dirty or has an interrupted Git operation"
    return 1
  }
}

lock_values() {
  [[ -f "$LOCK_FILE" ]] || return 1
  local candidate started expires extra
  read -r candidate started expires extra <"$LOCK_FILE" || return 1
  [[ -z "${extra:-}" ]] || return 1
  [[ "$candidate" =~ ^[0-9a-f]{40}$ ]] || return 1
  [[ "$started" =~ ^[0-9]+$ ]] || return 1
  [[ "$expires" =~ ^[0-9]+$ ]] || return 1
  printf '%s %s %s\n' "$candidate" "$started" "$expires"
}

promotion_lock_active() {
  local values candidate _started expires now
  values="$(lock_values || true)"
  if [[ -z "$values" ]]; then
    rm -f "$LOCK_FILE"
    return 1
  fi
  read -r candidate _started expires <<<"$values"
  now="$(date +%s)"
  if ((now > expires)); then
    rm -f "$LOCK_FILE"
    return 1
  fi
  return 0
}

capture_incident() {
  local stamp destination git_dir current_head path meta blob stage target
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  destination="$INCIDENT_DIR/$stamp"
  mkdir -p "$destination/conflict-stages" "$destination/git-state"
  git_dir="$("$GIT" -C "$ROOT" rev-parse --absolute-git-dir)"
  current_head="$("$GIT" -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"

  if [[ "$current_head" =~ ^[0-9a-f]{40}$ ]]; then
    "$GIT" -C "$ROOT" update-ref "refs/backup/main-uptime-guard/$stamp/observed" "$current_head"
  fi
  read_approved >"$destination/git-state/approved-head.txt"
  printf '%s\n' "$current_head" >"$destination/git-state/observed-head.txt"
  "$GIT" -C "$ROOT" status >"$destination/git-state/status.txt" || true
  "$GIT" -C "$ROOT" status --short --branch >"$destination/git-state/status-short.txt" || true
  "$GIT" -C "$ROOT" ls-files -u >"$destination/git-state/unmerged-index.txt" || true
  "$GIT" -C "$ROOT" diff --binary >"$destination/git-state/worktree.diff" || true
  "$GIT" -C "$ROOT" diff --cached --binary >"$destination/git-state/index.diff" || true
  "$GIT" -C "$ROOT" reflog --date=iso-strict -50 >"$destination/git-state/reflog.txt" || true

  for marker in index MERGE_MSG MERGE_MODE AUTO_MERGE CHERRY_PICK_HEAD MERGE_HEAD ORIG_HEAD; do
    if [[ -e "$git_dir/$marker" ]]; then
      cp -a "$git_dir/$marker" "$destination/git-state/$marker"
    fi
  done

  while IFS=$'\t' read -r meta path; do
    [[ -n "$meta" && -n "$path" ]] || continue
    read -r _ blob stage <<<"$meta"
    target="$destination/conflict-stages/$path.stage$stage"
    mkdir -p "$(dirname "$target")"
    "$GIT" -C "$ROOT" cat-file blob "$blob" >"$target"
  done < <("$GIT" -C "$ROOT" ls-files -u)

  {
    "$GIT" -C "$ROOT" diff --name-only -z || true
    "$GIT" -C "$ROOT" diff --cached --name-only -z || true
    "$GIT" -C "$ROOT" ls-files --others --exclude-standard -z || true
  } | sort -zu >"$destination/git-state/changed-paths.zlist"
  while IFS= read -r -d '' path; do
    if [[ -e "$ROOT/$path" || -L "$ROOT/$path" ]]; then
      printf '%s\0' "$path"
    fi
  done <"$destination/git-state/changed-paths.zlist" >"$destination/git-state/existing-paths.zlist"
  tar -C "$ROOT" --null -czf "$destination/worktree-files.tar.gz" \
    -T "$destination/git-state/existing-paths.zlist"
  "$GIT" -C "$ROOT" bundle create "$destination/t3code-all-refs.bundle" --all
  "$GIT" -C "$ROOT" bundle verify "$destination/t3code-all-refs.bundle" \
    >"$destination/git-state/bundle-verify.txt" 2>&1
  sha256sum "$destination/t3code-all-refs.bundle" "$destination/worktree-files.tar.gz" \
    >"$destination/SHA256SUMS"
  ln -sfn "$destination" "$STATE_DIR/latest-incident"
  printf '%s\n' "$destination"
}

restore_approved() {
  local approved git_dir path
  approved="$(read_approved)"
  git_dir="$("$GIT" -C "$ROOT" rev-parse --absolute-git-dir)"
  "$GIT" -C "$ROOT" ls-files --others --exclude-standard -z >"$STATE_DIR/restore-untracked.zlist"
  "$GIT" -C "$ROOT" symbolic-ref HEAD refs/heads/main
  "$GIT" -C "$ROOT" update-ref refs/heads/main "$approved"
  "$GIT" -C "$ROOT" read-tree --reset -u "$approved"
  while IFS= read -r -d '' path; do
    case "$path" in
      ""|/*|..|../*|*/../*) continue ;;
    esac
    rm -rf -- "$ROOT/$path"
  done <"$STATE_DIR/restore-untracked.zlist"
  rm -f "$STATE_DIR/restore-untracked.zlist"
  rm -f "$git_dir/MERGE_MSG" "$git_dir/MERGE_MODE" "$git_dir/AUTO_MERGE" \
    "$git_dir/CHERRY_PICK_HEAD" "$git_dir/MERGE_HEAD" "$git_dir/REBASE_HEAD"
  rm -rf "$git_dir/rebase-merge" "$git_dir/rebase-apply" "$git_dir/sequencer"
  preflight
}

restart_main() {
  "$SYSTEMCTL" --user restart t3code-main.service
}

health_ok() {
  local url="${1:-$HEALTH_URL}"
  "$CURL" -fsS --max-time 8 -o /dev/null "$url"
}

mark_started() {
  atomic_write "$STARTED_FILE" "$(date +%s)"
  rm -f "$HEALTH_FAILURE_FILE"
}

within_startup_grace() {
  [[ "$HEALTH_STARTUP_GRACE_SECONDS" =~ ^[0-9]+$ ]] ||
    die "startup grace must be a non-negative number of seconds"
  [[ -f "$STARTED_FILE" ]] || return 1
  local started now
  started="$(tr -d '[:space:]' <"$STARTED_FILE")"
  [[ "$started" =~ ^[0-9]+$ ]] || return 1
  now="$(date +%s)"
  ((now - started < HEALTH_STARTUP_GRACE_SECONDS))
}

record_health_failure() {
  [[ "$HEALTH_FAILURE_THRESHOLD" =~ ^[1-9][0-9]*$ ]] ||
    die "health failure threshold must be a positive integer"
  local count=0
  if [[ -f "$HEALTH_FAILURE_FILE" ]]; then
    count="$(tr -d '[:space:]' <"$HEALTH_FAILURE_FILE")"
    [[ "$count" =~ ^[0-9]+$ ]] || count=0
  fi
  count=$((count + 1))
  atomic_write "$HEALTH_FAILURE_FILE" "$count"
  printf '%s\n' "$count"
}

clear_health_failures() {
  rm -f "$HEALTH_FAILURE_FILE"
}

initialize() {
  local branch head
  mkdir -p "$STATE_DIR" "$INCIDENT_DIR"
  branch="$("$GIT" -C "$ROOT" branch --show-current)"
  head="$("$GIT" -C "$ROOT" rev-parse HEAD)"
  [[ "$branch" == "main" ]] || die "cannot initialize from ${branch:-detached HEAD}"
  checkout_is_clean || die "cannot initialize approved head from a dirty checkout"
  if [[ -f "$APPROVED_FILE" ]]; then
    preflight
    return
  fi
  atomic_write "$APPROVED_FILE" "$head"
  chmod 0644 "$APPROVED_FILE"
  preflight
}

guard() {
  mkdir -p "$STATE_DIR" "$INCIDENT_DIR"
  if promotion_lock_active; then
    return 0
  fi
  if preflight >/dev/null 2>&1; then
    return 0
  fi
  local incident
  incident="$(capture_incident)"
  echo "t3code-main-uptime: preserving unauthorized Main mutation at $incident" >&2
  restore_approved
  restart_main
}

health() {
  if health_ok; then
    clear_health_failures
    return 0
  fi
  if promotion_lock_active; then
    echo "t3code-main-uptime: health check deferred during approved promotion" >&2
    return 0
  fi
  if within_startup_grace; then
    echo "t3code-main-uptime: health check deferred during startup grace" >&2
    return 0
  fi
  if ! preflight >/dev/null 2>&1; then
    guard
    clear_health_failures
    return 0
  fi
  local local_healthy=false failures
  if health_ok "$LOCAL_HEALTH_URL"; then
    local_healthy=true
  fi
  failures="$(record_health_failure)"
  if ((failures < HEALTH_FAILURE_THRESHOLD)); then
    echo "t3code-main-uptime: health failure $failures/$HEALTH_FAILURE_THRESHOLD; leaving Main running" >&2
    return 0
  fi
  clear_health_failures
  if [[ "$local_healthy" == true ]]; then
    echo "t3code-main-uptime: public route unhealthy while local Main is healthy; reconciling Tailscale" >&2
    if [[ -x "$TAILSCALE_RECONCILE" ]]; then
      "$TAILSCALE_RECONCILE" || true
    fi
    if health_ok; then
      return 0
    fi
    echo "t3code-main-uptime: public route remains unhealthy; preserving the healthy Main process" >&2
    return 1
  fi
  echo "t3code-main-uptime: local and public health failed $HEALTH_FAILURE_THRESHOLD consecutive checks; restarting Main" >&2
  restart_main
}

promotion_begin() {
  local candidate="${1:-}" ttl="${2:-1800}" now expires
  [[ "$candidate" =~ ^[0-9a-f]{40}$ ]] || die "promotion-begin requires a full candidate SHA"
  [[ "$ttl" =~ ^[0-9]+$ ]] || die "promotion TTL must be seconds"
  "$GIT" -C "$ROOT" cat-file -e "$candidate^{commit}" 2>/dev/null ||
    die "candidate commit $candidate is unavailable"
  preflight
  now="$(date +%s)"
  expires="$((now + ttl))"
  rm -f "$PROOF_FILE"
  atomic_write "$LOCK_FILE" "$candidate $now $expires"
}

promotion_approve() {
  local candidate="${1:-}" values expected started _expires proof_candidate proof_time extra now head branch
  promotion_lock_active || die "no active promotion lock"
  values="$(lock_values)"
  read -r expected started _expires <<<"$values"
  [[ "$candidate" == "$expected" ]] || die "candidate $candidate does not match locked SHA $expected"
  branch="$("$GIT" -C "$ROOT" branch --show-current)"
  head="$("$GIT" -C "$ROOT" rev-parse HEAD)"
  [[ "$branch" == "main" ]] || die "promotion result is not on main"
  [[ "$head" == "$candidate" ]] || die "live HEAD $head does not match candidate $candidate"
  checkout_is_clean || die "cannot approve a dirty Main checkout"
  health_ok || die "cannot approve Main while $HEALTH_URL is unhealthy"
  [[ -f "$PROOF_FILE" ]] || die "missing strict Main public verification proof at $PROOF_FILE"
  read -r proof_candidate proof_time extra <"$PROOF_FILE" || die "invalid Main public verification proof"
  [[ -z "${extra:-}" ]] || die "invalid Main public verification proof"
  [[ "$proof_candidate" == "$candidate" ]] || die "Main public proof is for $proof_candidate, expected $candidate"
  [[ "$proof_time" =~ ^[0-9]+$ ]] || die "invalid Main public proof timestamp"
  now="$(date +%s)"
  ((proof_time >= started && proof_time <= now)) || die "Main public proof is not from this promotion window"
  atomic_write "$APPROVED_FILE" "$candidate"
  chmod 0644 "$APPROVED_FILE"
  mv -f "$PROOF_FILE" "$LAST_PROOF_FILE"
  chmod 0644 "$LAST_PROOF_FILE"
  rm -f "$LOCK_FILE"
  preflight
}

promotion_abort() {
  rm -f "$LOCK_FILE"
  if ! preflight >/dev/null 2>&1; then
    capture_incident >/dev/null
    restore_approved
  fi
  restart_main
}

status_command() {
  local approved head branch clean lock="inactive"
  approved="$(read_approved)"
  head="$("$GIT" -C "$ROOT" rev-parse HEAD)"
  branch="$("$GIT" -C "$ROOT" branch --show-current)"
  clean=false
  checkout_is_clean && clean=true
  promotion_lock_active && lock="active"
  printf 'approved=%s\nhead=%s\nbranch=%s\nclean=%s\npromotion_lock=%s\n' \
    "$approved" "$head" "$branch" "$clean" "$lock"
}

case "${1:-status}" in
  initialize) initialize ;;
  preflight) preflight ;;
  launch-preflight) launch_preflight ;;
  mark-started) mark_started ;;
  guard) guard ;;
  health) health ;;
  promotion-begin) shift; promotion_begin "$@" ;;
  promotion-approve) shift; promotion_approve "$@" ;;
  promotion-abort) promotion_abort ;;
  status) status_command ;;
  *) die "usage: $0 {initialize|preflight|launch-preflight|mark-started|guard|health|promotion-begin SHA [TTL]|promotion-approve SHA|promotion-abort|status}" ;;
esac
