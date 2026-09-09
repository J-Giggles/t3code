#!/usr/bin/env bash
# Per-worktree T3 dev workstation pods (Convex + Postgres + server/web/desktop over Tailscale).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INFRA_ROOT="$WORKSPACE_ROOT/infra/convex-docker"
PROVISION="$INFRA_ROOT/lib/provision.mjs"

usage() {
  cat <<'EOF'
Usage: t3-convex-docker.sh <command> [args]

Commands:
  provision <worktree-path> [--code-root PATH]
  up <slug|worktree> [--with-desktop]
  down <slug|worktree|all>
  destroy <slug|worktree> --i-know-what-im-doing
  keys <slug|worktree>
  health <slug|worktree|all>
  deploy <slug|worktree|all>
  bootstrap-pairing-url <slug|worktree>
  list
  preflight
  shell <slug|worktree>
  desktop <slug|worktree> [start|stop]
  dev-start <slug> <project-name>
  dev-stop <slug> <project-name>
  dev-list <slug>
  promote --from <slug> --to <slug> [--with-data]
  tailscale-status [slug|all]
  start-pod [slug|worktree]   Full bootstrap for one pod (provision, keys, up, deploy, desktop+noVNC)
  start-all                   Full bootstrap for main + staging pods
  apps <slug|worktree>        Start pod if down, then open Caddy + noVNC + pairing URLs
  open [slug|worktree|all]    Open browser URLs (Caddy app, dashboard, noVNC)

Examples:
  ./.agents/scripts/t3-convex-docker.sh provision t3code-staging
  ./.agents/scripts/t3-convex-docker.sh up t3code-staging
  ./.agents/scripts/t3-convex-docker.sh deploy all
  pnpm run pod:up              # workspace root — both pods; worktree — that pod only
  pnpm run pod:open            # open all pod UIs in the browser
EOF
}

open_url() {
  local url="${1:-}"
  if [[ -z "$url" || "$url" == "null" ]]; then
    return 0
  fi
  echo "  → $url"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v gtk-launch >/dev/null 2>&1; then
    gtk-launch "$(xdg-mime query default x-scheme-handler/http 2>/dev/null | sed 's/.desktop$//')" "$url" >/dev/null 2>&1 &
  else
    echo "    (install xdg-open to open URLs automatically)" >&2
  fi
}

resolve_context_slug() {
  local dir base
  dir="$(pwd)"
  base="$(basename "$dir")"
  case "$base" in
    t3code-main) echo "t3code-main" ;;
    t3code-staging) echo "t3code-staging" ;;
    *)
      if [[ "$dir" == *"/t3code-main"* ]]; then
        echo "t3code-main"
      elif [[ "$dir" == *"/t3code-staging"* ]]; then
        echo "t3code-staging"
      else
        echo "t3code-staging"
      fi
      ;;
  esac
}

needs_admin_key() {
  local key_file="${1:?}"
  if [[ ! -f "$key_file" ]]; then
    return 0
  fi
  local key
  key="$(tr -d '\n\r' <"$key_file")"
  [[ -z "$key" || "$key" == "run-keys-command-to-generate" ]]
}

resolve_slug() {
  local input="${1:-}"
  if [[ -z "$input" ]]; then
    echo "Missing slug or worktree path" >&2
    exit 1
  fi
  node "$PROVISION" resolve "$input" | jq -r '.slug'
}

compose_dir() {
  node "$PROVISION" resolve "$1" | jq -r '.generatedDir'
}

compose_project() {
  node "$PROVISION" resolve "$1" | jq -r '.composeProject'
}

set_pod_desktop_mode() {
  local dir="$1"
  local enabled="$2"
  local env_file="$dir/.env"
  if grep -q '^T3CODE_POD_WITH_DESKTOP=' "$env_file" 2>/dev/null; then
    sed -i "s/^T3CODE_POD_WITH_DESKTOP=.*/T3CODE_POD_WITH_DESKTOP=${enabled}/" "$env_file"
  else
    echo "T3CODE_POD_WITH_DESKTOP=${enabled}" >>"$env_file"
  fi
}

recreate_t3_stack() {
  local target="$1"
  local dir project
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" \
    up -d --force-recreate t3-stack
}

cmd_provision() {
  local worktree="${1:?worktree path}"
  shift || true
  local code_root=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --code-root) code_root="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [[ -n "$code_root" ]]; then
    T3CODE_POD_CODE_ROOT="$code_root" node "$PROVISION" provision "$worktree" --code-root "$code_root"
  else
    node "$PROVISION" provision "$worktree"
  fi
}

cmd_up() {
  local target="${1:?slug}"
  local with_desktop=""
  shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-desktop) with_desktop=1; shift ;;
      *) shift ;;
    esac
  done
  local dir project profiles
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  profiles="$(grep '^COMPOSE_PROFILES=' "$dir/.env" | cut -d= -f2-)"
  local convex_db_name
  convex_db_name="$(grep '^CONVEX_DB_NAME=' "$dir/.env" | cut -d= -f2-)"

  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" --profile "${profiles:-local}" up -d --build local-net postgres
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" exec -T postgres \
    sh -c 'until pg_isready -U convex -q; do sleep 1; done'
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" exec -T postgres \
    psql -U convex -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${convex_db_name}'" | grep -q 1 || \
    docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" exec -T postgres \
      psql -U convex -d postgres -c "CREATE DATABASE ${convex_db_name};"

  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" --profile "${profiles:-local}" up -d --build
  if [[ -n "$with_desktop" ]]; then
    docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" \
      --profile "${profiles:-local}" --profile desktop up -d
  fi
  cmd_health "$target"
}

cmd_down() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    target="$(resolve_context_slug)"
  fi
  if [[ "$target" == "all" ]]; then
    node "$PROVISION" list | jq -r '.entries[].slug' | while read -r slug; do
      cmd_down "$slug"
    done
    return
  fi
  local dir project
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" --profile tailscale --profile local --profile desktop down
}

cmd_destroy() {
  local target="${1:?slug}"
  if [[ "${2:-}" != "--i-know-what-im-doing" && "${*: -1}" != "--i-know-what-im-doing" ]]; then
    echo "Refusing destroy without --i-know-what-im-doing" >&2
    exit 1
  fi
  echo "WARN: destroy removes postgres + t3code_home volumes — browser pairing will be required again (use bootstrap-pairing-url)." >&2
  local dir project
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" down -v
}

cmd_keys() {
  local target="${1:?slug}"
  local dir project manifest_path admin_file
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  manifest_path="$(node "$PROVISION" resolve "$target" | jq -r '.worktreePath')/.local/convex-docker/admin.key"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" exec -T backend ./generate_admin_key.sh | tee "$manifest_path"
  chmod 600 "$manifest_path" 2>/dev/null || true
}

cmd_health() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    target="$(resolve_context_slug)"
  fi
  if [[ "$target" == "all" ]]; then
    cmd_health t3code-main
    cmd_health t3code-staging
    return
  fi
  local manifest convex_url server_url web_url
  manifest="$(node "$PROVISION" resolve "$target")"
  convex_url="$(echo "$manifest" | jq -r '.urls.local.convexUrl')"
  server_url="$(echo "$manifest" | jq -r '.urls.local.serverUrl')"
  web_url="$(echo "$manifest" | jq -r '.urls.local.appUrl')"
  echo "== health $target =="
  curl -sf "$convex_url/version" >/dev/null && echo "convex_ok=yes" || echo "convex_ok=no"
  if curl -sf --max-time 5 "$web_url" >/dev/null 2>&1; then
    echo "web_ok=yes"
  elif curl -sf --max-time 5 "${web_url%/}/" >/dev/null 2>&1; then
    echo "web_ok=yes"
  else
    echo "web_ok=no"
  fi
  curl -sf "${server_url}/api/local/stack-health" >/dev/null 2>&1 && echo "server_ok=yes" || echo "server_ok=no"
}

cmd_verify_admin_key() {
  local convex_url="$1"
  local admin_key="$2"
  local response
  response="$(curl -sf -X POST "${convex_url}/api/get_config_hashes" \
    -H "Content-Type: application/json" \
    -d "{\"adminKey\":\"${admin_key}\"}" 2>/dev/null || true)"
  if [[ -z "$response" ]]; then
    echo "convex_admin_key=invalid (no response)"
    return 1
  fi
  if echo "$response" | rg -q 'BadAdminKey|Unauthorized'; then
    echo "convex_admin_key=invalid"
    return 1
  fi
  if echo "$response" | rg -q 'moduleHashes|config'; then
    echo "convex_admin_key=valid"
    return 0
  fi
  echo "convex_admin_key=unknown"
  return 1
}

cmd_deploy() {
  local target="${1:?slug}"
  if [[ "$target" == "all" ]]; then
    cmd_deploy t3code-main
    cmd_deploy t3code-staging
    return
  fi
  local manifest worktree admin_key convex_url
  manifest="$(node "$PROVISION" resolve "$target")"
  worktree="$(echo "$manifest" | jq -r '.worktreePath')"
  admin_key="$(tr -d '\n\r' <"$worktree/.local/convex-docker/admin.key" 2>/dev/null || true)"
  convex_url="$(echo "$manifest" | jq -r '.urls.local.convexUrl')"
  if [[ -z "$admin_key" || "$admin_key" == "run-keys-command-to-generate" ]]; then
    echo "No admin key — run: keys $target" >&2
    exit 1
  fi
  if ! cmd_verify_admin_key "$convex_url" "$admin_key"; then
    echo "Admin key rejected by Convex at $convex_url — run: keys $target && recreate t3-stack" >&2
    exit 1
  fi
  local deploy_env deploy_worktree
  deploy_env="$(mktemp)"
  deploy_worktree="$worktree"
  if [[ ! -d "$deploy_worktree/packages/convex" ]]; then
    deploy_worktree="$(node "$PROVISION" resolve t3code-staging | jq -r '.mounts.codeMountPath // .worktreePath')"
    echo "Using $deploy_worktree for convex deploy (target worktree has no packages/convex)" >&2
  fi
  printf 'CONVEX_SELF_HOSTED_URL=%s\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$convex_url" "$admin_key" >"$deploy_env"
  (
    cd "$deploy_worktree/packages/convex"
    bunx convex deploy --typecheck disable --env-file "$deploy_env"
  )
  rm -f "$deploy_env"
  cmd_verify_admin_key "$convex_url" "$admin_key"
}

cmd_bootstrap_pairing_url() {
  local target="${1:?slug}"
  local manifest server_url caddy_url worktree
  manifest="$(node "$PROVISION" resolve "$target")"
  server_url="$(echo "$manifest" | jq -r '.urls.local.serverUrl')"
  caddy_url="$(echo "$manifest" | jq -r '.urls.local.caddyUrl')"
  worktree="$(echo "$manifest" | jq -r '.worktreePath')"
  local dir project container logs pairing_url token
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  container="${project}-t3-desktop-1"
  if ! docker ps --format '{{.Names}}' | rg -qx "$container"; then
    container="${project}-t3-stack-1"
  fi
  if docker ps --format '{{.Names}}' | rg -qx "$container"; then
    logs="$(docker logs "$container" 2>&1 | tail -400)"
    pairing_url="$(echo "$logs" | rg -o 'https?://[^ ]+/pair#token=[^ ]+' | tail -1 || true)"
    if [[ -z "$pairing_url" ]]; then
      pairing_url="$(echo "$logs" | rg -o 'pairingUrl: [^ ]+' | tail -1 | sed 's/^pairingUrl: //' || true)"
    fi
    token="$(echo "$logs" | rg -o 'pair#token=[^ ]+' | tail -1 | sed 's/^pair#token=//' || true)"
    if [[ -z "$token" ]]; then
      token="$(echo "$logs" | rg -o 'Token: [^ ]+' | tail -1 | sed 's/^Token: //' || true)"
    fi
  fi
  if [[ -z "$pairing_url" ]]; then
    stack_container="${project}-t3-stack-1"
    if docker ps --format '{{.Names}}' | rg -qx "$stack_container"; then
      logs="$(docker logs "$stack_container" 2>&1 | tail -400)"
      pairing_url="$(echo "$logs" | rg -o 'pairingUrl: [^ ]+' | tail -1 | sed 's/^pairingUrl: //' || true)"
      token="$(echo "$logs" | rg -o 'pair#token=[^ ]+' | tail -1 | sed 's/^pair#token=//' || true)"
    fi
  fi
  if [[ -z "$pairing_url" && -n "$token" ]]; then
    pairing_url="${caddy_url%/}/pair#token=${token}"
  fi
  if [[ -z "$pairing_url" ]] && docker ps --format '{{.Names}}' | rg -qx "${project}-t3-desktop-1"; then
    pairing_output="$(docker exec "${project}-t3-desktop-1" node /workspace/t3code/apps/server/dist/bin.mjs auth pairing create --base-url "$caddy_url" 2>/dev/null || true)"
    pairing_url="$(echo "$pairing_output" | rg -o 'https?://[^ ]+/pair#token=[^ ]+' | tail -1 || true)"
    if [[ -z "$pairing_url" ]]; then
      token="$(echo "$pairing_output" | rg -o 'pair#token=[^ ]+' | tail -1 | sed 's/^pair#token=//' || true)"
      if [[ -n "$token" ]]; then
        pairing_url="${caddy_url%/}/pair#token=${token}"
      fi
    fi
  fi
  if [[ -z "$pairing_url" ]]; then
    echo "Could not find pairing URL in container logs for $target." >&2
    echo "Ensure desktop or stack is running, then check logs:" >&2
    echo "  docker logs $container 2>&1 | rg 'Pairing URL|pair#token'" >&2
    return 1
  fi
  # Prefer Caddy origin for browser pairing (matches VITE_DEV_SERVER_URL).
  if [[ "$pairing_url" =~ pair#token=([^ ]+) ]]; then
    token="${BASH_REMATCH[1]}"
    pairing_url="${caddy_url%/}/pair#token=${token}"
  fi
  echo "pairing_url=$pairing_url"
  echo "caddy_app=${caddy_url}"
  echo "vite_app=$(echo "$manifest" | jq -r '.urls.local.appUrl')"
  echo "admin_key_file=$worktree/.local/convex-docker/admin.key"
}

cmd_preflight() {
  echo "== preflight =="
  if pgrep -f convex-local-backend >/dev/null 2>&1; then
    echo "WARN native convex-local-backend running — may conflict with pod ports" >&2
  fi
  ss -tlnp 2>/dev/null | rg ':(3210|3220|6791|6792)\b' || echo "ports_clear=yes"
}

cmd_shell() {
  local target="${1:?slug}"
  local dir project
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" exec t3-stack bash
}

cmd_desktop() {
  local target="${1:?slug}"
  local action="${2:-start}"
  local mode="x11"
  shift 2 || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --novnc) mode="novnc"; shift ;;
      *) shift ;;
    esac
  done
  local dir project
  dir="$(compose_dir "$target")"
  project="$(compose_project "$target")"
  if [[ "$action" == "start" ]]; then
    set_pod_desktop_mode "$dir" 1
    recreate_t3_stack "$target"
    if [[ "$mode" == "x11" ]]; then
      command -v xhost >/dev/null 2>&1 && xhost +local:docker >/dev/null 2>&1 || true
      local xauth_file
      xauth_file="$(mktemp /tmp/t3pod-xauth.XXXXXX)"
      touch "$xauth_file"
      if command -v xauth >/dev/null 2>&1; then
        xauth nlist "${DISPLAY:-:1}" 2>/dev/null | sed -e 's/^..../ffff/' | xauth -f "$xauth_file" nmerge - 2>/dev/null || true
      fi
      DISPLAY="${DISPLAY:-:1}" \
      DOCKER_XAUTH_FILE="$xauth_file" \
      T3CODE_DESKTOP_DISPLAY=x11 \
        docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" \
          --profile local --profile desktop up -d --force-recreate t3-desktop || mode="novnc"
    fi
    if [[ "$mode" == "novnc" ]]; then
      echo "[desktop] Using Xvfb + noVNC (Hyprland/Wayland has no X11 auth for Docker)" >&2
      T3CODE_DESKTOP_DISPLAY=novnc DISPLAY= DOCKER_XAUTH_FILE=/dev/null \
        docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" \
          --profile local --profile desktop up -d --build --force-recreate t3-desktop novnc
    fi
  else
    docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" stop t3-desktop novnc
    set_pod_desktop_mode "$dir" 0
    recreate_t3_stack "$target"
  fi
}

cmd_open() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    target="$(resolve_context_slug)"
  fi
  if [[ "$target" == "all" ]]; then
    cmd_open t3code-main
    cmd_open t3code-staging
    return
  fi
  local manifest slug caddy dashboard app novnc
  manifest="$(node "$PROVISION" resolve "$target")"
  slug="$(echo "$manifest" | jq -r '.slug')"
  caddy="$(echo "$manifest" | jq -r '.urls.local.caddyUrl')"
  dashboard="$(echo "$manifest" | jq -r '.urls.local.dashboardUrl')"
  app="$(echo "$manifest" | jq -r '.urls.local.appUrl')"
  novnc="${caddy%/}/vnc/vnc.html?autoconnect=true&resize=scale&path=vnc/websocket"
  echo "Opening pod $slug:"
  echo "  Clipboard: Ctrl+C in VNC copies to host; Ctrl+V pastes from host"
  if pairing_line="$(cmd_bootstrap_pairing_url "$target" 2>/dev/null | rg '^pairing_url=' || true)"; then
    pairing_url="${pairing_line#pairing_url=}"
    if [[ -n "$pairing_url" ]]; then
      echo "  Pairing (open once per fresh pod DB or new browser origin):"
      open_url "$pairing_url"
    fi
  else
    echo "  (pairing URL not ready — stack/desktop may still be booting; retry: bootstrap-pairing-url $target)" >&2
  fi
  open_url "$caddy"
  open_url "${caddy%/}/dashboard/"
  open_url "$novnc"
  open_url "$dashboard"
}

pod_stack_running() {
  local target="$1"
  local project
  project="$(compose_project "$target")"
  docker ps --format '{{.Names}}' 2>/dev/null | rg -qx "${project}-t3-stack-1"
}

pod_is_healthy() {
  local target="$1"
  local out
  out="$(cmd_health "$target" 2>&1)" || true
  echo "$out" | grep -q 'convex_ok=yes' \
    && echo "$out" | grep -q 'web_ok=yes' \
    && echo "$out" | grep -q 'server_ok=yes'
}

wait_for_pod_health() {
  local target="$1"
  local max_attempts="${2:-36}"
  local attempt=0
  while [ "$attempt" -lt "$max_attempts" ]; do
    if pod_is_healthy "$target"; then
      echo "[apps] $target healthy"
      return 0
    fi
    attempt=$((attempt + 1))
    echo "[apps] waiting for $target health ($attempt/$max_attempts)…"
    sleep 5
  done
  echo "[apps] WARN: $target not fully healthy yet — opening URLs anyway" >&2
  cmd_health "$target" || true
  return 1
}

cmd_apps() {
  local target="${1:?slug|worktree}"
  if [[ "$target" == "t3code-main" || "$target" == *"/t3code-main"* ]]; then
    target="t3code-main"
  elif [[ "$target" == "t3code-staging" || "$target" == *"/t3code-staging"* ]]; then
    target="t3code-staging"
  fi

  echo "== apps $target =="
  if pod_stack_running "$target" && pod_is_healthy "$target"; then
    echo "[apps] Pod already running — ensuring desktop + noVNC…"
    cmd_desktop "$target" start --novnc 2>/dev/null || true
  else
    echo "[apps] Pod not running or unhealthy — full bootstrap…"
    cmd_start_pod "$target" || echo "[apps] WARN: bootstrap had errors — opening URLs anyway" >&2
    wait_for_pod_health "$target" || true
  fi
  cmd_open "$target"
  return 0
}

cmd_start_pod() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    target="$(resolve_context_slug)"
  fi
  local worktree manifest_path key_file
  worktree="$(node "$PROVISION" resolve "$target" | jq -r '.worktreePath')"
  manifest_path="$worktree/.local/convex-docker/manifest.json"
  if [[ ! -f "$manifest_path" ]]; then
    echo "[pod] Provisioning $target…"
    cmd_provision "$worktree"
  fi
  key_file="$worktree/.local/convex-docker/admin.key"
  if needs_admin_key "$key_file"; then
    echo "[pod] Generating Convex admin key for $target…"
    cmd_keys "$target"
  fi
  echo "[pod] Starting stack for $target…"
  cmd_up "$target"
  echo "[pod] Deploying Convex functions for $target…"
  cmd_deploy "$target" || echo "[pod] WARN: convex deploy failed for $target (stack may still be starting)" >&2
  echo "[pod] Starting desktop + noVNC for $target…"
  cmd_desktop "$target" start --novnc || echo "[pod] WARN: desktop start failed — retry: desktop $target start --novnc" >&2
  cmd_health "$target" || true
  echo ""
  echo "[pod] Pairing URL (required after volume wipe or first boot; always use Caddy origin):"
  cmd_bootstrap_pairing_url "$target" 2>/dev/null || echo "  (retry when server is ready: ./.agents/scripts/t3-convex-docker.sh bootstrap-pairing-url $target)" >&2
  echo ""
  echo "Pod $target is up."
  return 0
}

cmd_start_all() {
  cmd_preflight
  echo "[pod] Bootstrapping main + staging pods…"
  cmd_start_pod t3code-main
  echo ""
  cmd_start_pod t3code-staging
  echo ""
  echo "All pods are up. Open with: pnpm run apps && pnpm run apps:staging"
  cmd_health all
}

cmd_dev_start() {
  local slug="${1:?slug}" project="${2:?project}"
  local dir
  dir="$(compose_dir "$slug")"
  docker compose --project-directory "$dir" -p "$(compose_project "$slug")" --env-file "$dir/.env" \
    exec -T t3-stack node /opt/pod-scripts/dev-manager.mjs start "$project"
}

cmd_dev_stop() {
  local slug="${1:?slug}" project="${2:?project}"
  local dir
  dir="$(compose_dir "$slug")"
  docker compose --project-directory "$dir" -p "$(compose_project "$slug")" --env-file "$dir/.env" \
    exec -T t3-stack node /opt/pod-scripts/dev-manager.mjs stop "$project"
}

cmd_dev_list() {
  local slug="${1:?slug}"
  local dir
  dir="$(compose_dir "$slug")"
  docker compose --project-directory "$dir" -p "$(compose_project "$slug")" --env-file "$dir/.env" \
    exec -T t3-stack node /opt/pod-scripts/dev-manager.mjs list
}

cmd_promote() {
  local from="" to="" with_data=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from) from="$2"; shift 2 ;;
      --to) to="$2"; shift 2 ;;
      --with-data) with_data=1; shift ;;
      *) shift ;;
    esac
  done
  [[ -n "$from" && -n "$to" ]] || { echo "Usage: promote --from staging --to main" >&2; exit 1; }
  local main_wt staging_wt
  main_wt="$(node "$PROVISION" resolve "$to" | jq -r '.worktreePath')"
  staging_wt="$(node "$PROVISION" resolve "$from" | jq -r '.worktreePath')"
  git -C "$main_wt" merge "$(git -C "$staging_wt" rev-parse --abbrev-ref HEAD)" -m "Merge $from into $to (pod promotion)" || true
  cmd_deploy "$to"
  if [[ -n "$with_data" ]]; then
    local from_url to_url from_key to_key deploy_worktree tmp_export
    from_url="$(node "$PROVISION" resolve "$from" | jq -r '.urls.local.convexUrl')"
    to_url="$(node "$PROVISION" resolve "$to" | jq -r '.urls.local.convexUrl')"
    from_key="$(cat "$(node "$PROVISION" resolve "$from" | jq -r '.worktreePath')/.local/convex-docker/admin.key")"
    to_key="$(cat "$(node "$PROVISION" resolve "$to" | jq -r '.worktreePath')/.local/convex-docker/admin.key")"
    deploy_worktree="$(node "$PROVISION" resolve t3code-staging | jq -r '.mounts.codeMountPath // .worktreePath')"
    tmp_export="$(mktemp -t convex-export.XXXXXX.zip)"
    (
      cd "$deploy_worktree/packages/convex"
      printf 'CONVEX_SELF_HOSTED_URL=%s\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$from_url" "$from_key" > /tmp/convex-export.env
      bunx convex export --path "$tmp_export" --env-file /tmp/convex-export.env
      printf 'CONVEX_SELF_HOSTED_URL=%s\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$to_url" "$to_key" > /tmp/convex-import.env
      bunx convex import --path "$tmp_export" --env-file /tmp/convex-import.env
    )
    rm -f "$tmp_export" /tmp/convex-export.env /tmp/convex-import.env
  fi
  local dir project
  dir="$(compose_dir "$to")"
  project="$(compose_project "$to")"
  docker compose --project-directory "$dir" -p "$project" --env-file "$dir/.env" restart t3-stack
  cmd_health "$to"
}

cmd_tailscale_status() {
  local target="${1:-all}"
  if [[ "$target" == "all" ]]; then
    node "$PROVISION" list | jq -r '.entries[].slug' | while read -r slug; do cmd_tailscale_status "$slug"; done
    return
  fi
  node "$PROVISION" resolve "$target" | jq '{slug, tailscale, urls}'
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    provision) cmd_provision "$@" ;;
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    destroy) cmd_destroy "$@" ;;
    keys) cmd_keys "$@" ;;
    health) cmd_health "$@" ;;
    deploy) cmd_deploy "$@" ;;
    bootstrap-pairing-url) cmd_bootstrap_pairing_url "$@" ;;
    list) node "$PROVISION" list ;;
    preflight) cmd_preflight ;;
    shell) cmd_shell "$@" ;;
    desktop) cmd_desktop "$@" ;;
    open) cmd_open "$@" ;;
    apps) cmd_apps "$@" ;;
    start-pod) cmd_start_pod "$@" ;;
    start-all) cmd_start_all ;;
    dev-start) cmd_dev_start "$@" ;;
    dev-stop) cmd_dev_stop "$@" ;;
    dev-list) cmd_dev_list "$@" ;;
    promote) cmd_promote "$@" ;;
    tailscale-status) cmd_tailscale_status "$@" ;;
    ""|-h|--help|help) usage ;;
    *) echo "Unknown command: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
