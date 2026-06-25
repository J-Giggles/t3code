// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const OMARCHY_DEV_LAUNCHER_TARGETS = ["original", "main", "staging", "manual-port"] as const;
export type OmarchyDevLauncherTarget = (typeof OMARCHY_DEV_LAUNCHER_TARGETS)[number];
export type OmarchyDevLauncherTargetSelection = OmarchyDevLauncherTarget | "all";
export type OmarchyDevLauncherInstallMode = "dry-run" | "write";
export type OmarchyDevLauncherFileKind = "script" | "desktop-entry";
export type OmarchyDevLauncherInstallAction = "create" | "update" | "unchanged";

export interface OmarchyDevLauncherDefinition {
  readonly target: OmarchyDevLauncherTarget;
  readonly branch: string;
  readonly title: string;
  readonly slug: string;
  readonly worktreeRelativePath: string;
  readonly portOffset: string;
  readonly serverPort: string;
  readonly webPort: string;
  readonly desktopDebuggingPort: string;
  readonly command: string;
  readonly desktopName: string;
  readonly desktopComment: string;
  readonly desktopKeywords: string;
  readonly desktopExecKind: "direct" | "uwsm-ghostty";
  readonly tailscaleServePath?: string;
  readonly workspaceSlug?: string;
  readonly worktreeRole?: string;
}

export interface RenderedOmarchyDevLauncherFile {
  readonly target: OmarchyDevLauncherTarget;
  readonly kind: OmarchyDevLauncherFileKind;
  readonly path: string;
  readonly content: string;
  readonly mode: number;
}

export interface OmarchyDevLauncherInstallOptions {
  readonly mode: OmarchyDevLauncherInstallMode;
  readonly target?: OmarchyDevLauncherTargetSelection;
  readonly homeDir?: string;
  readonly now?: Date;
  readonly validateWorktrees?: boolean;
}

export interface OmarchyDevLauncherInstallResultEntry {
  readonly target: OmarchyDevLauncherTarget;
  readonly kind: OmarchyDevLauncherFileKind;
  readonly path: string;
  readonly action: OmarchyDevLauncherInstallAction;
  readonly backupPath?: string;
  readonly written: boolean;
}

export interface OmarchyDevLauncherInstallResult {
  readonly mode: OmarchyDevLauncherInstallMode;
  readonly target: OmarchyDevLauncherTargetSelection;
  readonly entries: ReadonlyArray<OmarchyDevLauncherInstallResultEntry>;
}

export interface ParsedOmarchyDevLauncherArgs {
  readonly mode: OmarchyDevLauncherInstallMode;
  readonly target: OmarchyDevLauncherTargetSelection;
  readonly help: boolean;
}

export class OmarchyDevLauncherError extends Error {
  override readonly name = "OmarchyDevLauncherError";
}

const DEFINITIONS = [
  {
    target: "original",
    branch: "original",
    title: "T3code Dev Original",
    slug: "original",
    worktreeRelativePath: "code/t3code/.worktrees/original",
    portOffset: "0",
    serverPort: "13773",
    webPort: "5733",
    desktopDebuggingPort: "9230",
    command: "mise exec node@24.13.1 -- pnpm run dev:desktop",
    desktopName: "T3 Code Original",
    desktopComment: "Run T3 Code from the upstream original worktree.",
    desktopKeywords: "t3code;T3 Code;dev;original;upstream;",
    desktopExecKind: "uwsm-ghostty",
    workspaceSlug: "original",
    worktreeRole: "original",
  },
  {
    target: "main",
    branch: "main",
    title: "T3code Dev Main",
    slug: "main",
    worktreeRelativePath: "code/t3code",
    portOffset: "20",
    serverPort: "13793",
    webPort: "5753",
    desktopDebuggingPort: "9231",
    command: "pnpm run dev:desktop",
    desktopName: "T3 Code Main",
    desktopComment: "Run pnpm dev on the main worktree.",
    desktopKeywords: "t3code;T3 Code;dev;main;",
    desktopExecKind: "uwsm-ghostty",
    workspaceSlug: "main",
    worktreeRole: "main",
  },
  {
    target: "staging",
    branch: "staging",
    title: "T3code Dev Staging",
    slug: "staging",
    worktreeRelativePath: "code/t3code/.worktrees/staging",
    portOffset: "60",
    serverPort: "13833",
    webPort: "5793",
    desktopDebuggingPort: "9232",
    command: "pnpm run dev:desktop",
    desktopName: "T3 Code Staging",
    desktopComment: "Run pnpm dev on the staging worktree.",
    desktopKeywords: "t3code;T3 Code;dev;staging;",
    desktopExecKind: "direct",
    workspaceSlug: "staging",
    worktreeRole: "staging",
  },
  {
    target: "manual-port",
    branch: "dev/staging-upstream-manual-port-20260624",
    title: "T3code Dev Manual Port",
    slug: "dev-staging-upstream-manual-port-20260624",
    worktreeRelativePath: "code/t3code/.worktrees/dev-staging-upstream-manual-port-20260624",
    portOffset: "80",
    serverPort: "13853",
    webPort: "5813",
    desktopDebuggingPort: "9233",
    command: "pnpm run dev:desktop",
    desktopName: "T3 Code Manual Port",
    desktopComment: "Run pnpm dev on the manual upstream port worktree.",
    desktopKeywords: "t3code;T3 Code;dev;manual-port;",
    desktopExecKind: "direct",
    workspaceSlug: "dev-staging-upstream-manual-port-20260624",
    worktreeRole: "dev-staging-upstream-manual-port-20260624",
  },
] as const satisfies ReadonlyArray<OmarchyDevLauncherDefinition>;

function isOmarchyDevLauncherTarget(value: string): value is OmarchyDevLauncherTarget {
  return OMARCHY_DEV_LAUNCHER_TARGETS.includes(value as OmarchyDevLauncherTarget);
}

function selectedDefinitions(
  target: OmarchyDevLauncherTargetSelection = "all",
): ReadonlyArray<OmarchyDevLauncherDefinition> {
  return target === "all"
    ? DEFINITIONS
    : DEFINITIONS.filter((definition) => definition.target === target);
}

function worktreePath(definition: OmarchyDevLauncherDefinition, homeDir: string): string {
  return NodePath.join(homeDir, ...definition.worktreeRelativePath.split("/"));
}

function launcherPath(target: OmarchyDevLauncherTarget, homeDir: string): string {
  return NodePath.join(homeDir, ".local", "bin", `t3code-dev-${target}`);
}

function desktopEntryPath(target: OmarchyDevLauncherTarget, homeDir: string): string {
  return NodePath.join(homeDir, ".local", "share", "applications", `t3code-dev-${target}.desktop`);
}

function renderPathMatcher(target: OmarchyDevLauncherTarget): string {
  const mainExclusion =
    target === "main"
      ? [
          "",
          '  if [[ "$value" == "$WORKTREE/.worktrees" ]] ||',
          '    [[ "$value" == "$WORKTREE/.worktrees/"* ]] ||',
          '    [[ "$value" == *"$WORKTREE/.worktrees/"* ]]; then',
          "    return 1",
          "  fi",
        ].join("\n")
      : "";

  return [
    "path_matches_worktree() {",
    '  local value="$1"',
    "",
    '  if [[ -z "$value" ]]; then',
    "    return 1",
    "  fi",
    mainExclusion,
    "",
    '  [[ "$value" == "$WORKTREE" ]] ||',
    '    [[ "$value" == "$WORKTREE/"* ]] ||',
    '    [[ "$value" == *"$WORKTREE"* ]]',
    "}",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function renderOptionalExports(definition: OmarchyDevLauncherDefinition): ReadonlyArray<string> {
  return [
    ...(definition.tailscaleServePath
      ? [`  export T3CODE_TAILSCALE_SERVE_PATH="${definition.tailscaleServePath}"`]
      : []),
    ...(definition.workspaceSlug
      ? [`  export T3CODE_WORKSPACE_SLUG="${definition.workspaceSlug}"`]
      : []),
    ...(definition.worktreeRole
      ? [`  export T3CODE_WORKTREE_ROLE="${definition.worktreeRole}"`]
      : []),
  ];
}

export function renderOmarchyDevLauncherScript(definition: OmarchyDevLauncherDefinition): string {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `WORKTREE="$HOME/${definition.worktreeRelativePath}"`,
    `TITLE="${definition.title}"`,
    `SLUG="${definition.slug}"`,
    `EXPECTED_BRANCH="${definition.branch}"`,
    "",
    "ensure_expected_branch() {",
    "  local branch",
    '  branch="$(git -C "$WORKTREE" branch --show-current 2>/dev/null || true)"',
    '  if [[ "$branch" != "$EXPECTED_BRANCH" ]]; then',
    "    echo \"Refusing to launch $TITLE: $WORKTREE is on '${branch:-detached HEAD}', expected '$EXPECTED_BRANCH'.\" >&2",
    "    exit 1",
    "  fi",
    "}",
    "",
    "setup_path() {",
    "  local part",
    "  for part in \\",
    '    "$HOME/.local/share/pnpm" \\',
    '    "$HOME/.local/share/mise/shims" \\',
    '    "$HOME/.local/share/mise/installs/bun/1.3.9/bin" \\',
    '    "$HOME/.local/bin" \\',
    '    "/usr/local/bin" \\',
    '    "/usr/bin"; do',
    '    if [[ -d "$part" ]] && [[ ":$PATH:" != *":$part:"* ]]; then',
    '      PATH="$part:$PATH"',
    "    fi",
    "  done",
    "  export PATH",
    "}",
    "",
    renderPathMatcher(definition.target),
    "",
    "process_matches_worktree() {",
    '  local pid="$1"',
    "  local cmd",
    "  local cwd",
    "",
    '  if [[ "$pid" == "$$" || "$pid" == "${BASHPID:-}" || "$pid" == "$PPID" ]]; then',
    "    return 1",
    "  fi",
    "",
    "  cmd=\"$(tr '\\0' ' ' <\"/proc/$pid/cmdline\" 2>/dev/null || true)\"",
    '  if [[ -z "$cmd" ]]; then',
    "    return 1",
    "  fi",
    "",
    '  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"',
    "",
    "  if {",
    '    path_matches_worktree "$cmd" ||',
    '      path_matches_worktree "$cwd"',
    "  } && {",
    '    [[ "$cmd" == *"dev-runner.ts"* ]] ||',
    '      [[ "$cmd" == *"pnpm run dev:desktop"* ]] ||',
    '      [[ "$cmd" == *"vite-plus"* ]] ||',
    '      [[ "$cmd" == *"vp run"* ]] ||',
    '      [[ "$cmd" == *"vp dev"* ]] ||',
    '      [[ "$cmd" == *"vp pack"* ]] ||',
    '      [[ "$cmd" == *"dev-electron.mjs"* ]] ||',
    '      [[ "$cmd" == *"electron"* ]] ||',
    '      [[ "$cmd" == *"src/bin.ts"* ]]',
    "  }; then",
    "    return 0",
    "  fi",
    "",
    "  return 1",
    "}",
    "",
    "matching_pids() {",
    "  local proc",
    "  local pid",
    "",
    "  for proc in /proc/[0-9]*; do",
    '    pid="${proc##*/}"',
    '    if process_matches_worktree "$pid"; then',
    "      printf '%s\\n' \"$pid\"",
    "    fi",
    "  done | sort -rn",
    "}",
    "",
    "stop_existing_dev() {",
    "  local pids",
    "  local remaining",
    "",
    "  mapfile -t pids < <(matching_pids)",
    '  if [[ "${#pids[@]}" -eq 0 ]]; then',
    "    return",
    "  fi",
    "",
    '  echo "Restarting $TITLE: stopping existing dev processes (${pids[*]})." >&2',
    '  kill "${pids[@]}" 2>/dev/null || true',
    "  sleep 2",
    "",
    "  mapfile -t remaining < <(matching_pids)",
    '  if [[ "${#remaining[@]}" -gt 0 ]]; then',
    '    echo "Restarting $TITLE: force-stopping lingering dev processes (${remaining[*]})." >&2',
    '    kill -9 "${remaining[@]}" 2>/dev/null || true',
    "    sleep 1",
    "  fi",
    "}",
    "",
    "electron_process_matches_worktree() {",
    '  local pid="$1"',
    "  local cmd",
    "  local cwd",
    "",
    '  if [[ "$pid" == "$$" || "$pid" == "${BASHPID:-}" || "$pid" == "$PPID" ]]; then',
    "    return 1",
    "  fi",
    "",
    "  cmd=\"$(tr '\\0' ' ' <\"/proc/$pid/cmdline\" 2>/dev/null || true)\"",
    '  if [[ -z "$cmd" ]]; then',
    "    return 1",
    "  fi",
    "",
    '  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"',
    "",
    "  if {",
    '    path_matches_worktree "$cmd" ||',
    '      path_matches_worktree "$cwd"',
    '  } && [[ "$cmd" == *"--t3code-dev-root="* ]]; then',
    "    return 0",
    "  fi",
    "",
    "  return 1",
    "}",
    "",
    "electron_running() {",
    "  local proc",
    "  local pid",
    "",
    "  for proc in /proc/[0-9]*; do",
    '    pid="${proc##*/}"',
    '    if electron_process_matches_worktree "$pid"; then',
    "      return 0",
    "    fi",
    "  done",
    "",
    "  return 1",
    "}",
    "",
    "run_dev_command() {",
    `  ${definition.command}`,
    "}",
    "",
    "run_supervised_dev_command() {",
    '  local dev_pid=""',
    '  local monitor_pid=""',
    "  local shutdown_requested=0",
    "  local restart_delay_seconds=2",
    "",
    "  terminate_supervised_dev() {",
    "    shutdown_requested=1",
    "    trap - INT TERM HUP",
    '    if [[ -n "$monitor_pid" ]]; then',
    '      kill "$monitor_pid" 2>/dev/null || true',
    "    fi",
    '    if [[ -n "$dev_pid" ]]; then',
    "      stop_existing_dev",
    "    fi",
    "  }",
    "",
    "  monitor_electron_lifetime() {",
    '    local supervised_pid="$1"',
    "    local observed=0",
    "    local missing_since=0",
    "    local now",
    "",
    '    while kill -0 "$supervised_pid" 2>/dev/null; do',
    "      if electron_running; then",
    "        observed=1",
    "        missing_since=0",
    '      elif [[ "$observed" -eq 1 ]]; then',
    '        now="$(date +%s)"',
    '        if [[ "$missing_since" -eq 0 ]]; then',
    '          missing_since="$now"',
    "        elif ((now - missing_since >= 4)); then",
    '          echo "$TITLE: Electron exited; restarting the Vite+ dev stack." >&2',
    "          stop_existing_dev",
    "          return",
    "        fi",
    "      fi",
    "      sleep 1",
    "    done",
    "  }",
    "",
    "  trap terminate_supervised_dev INT TERM HUP",
    "",
    "  while true; do",
    "    stop_existing_dev",
    "    run_dev_command &",
    '    dev_pid="$!"',
    '    monitor_electron_lifetime "$dev_pid" &',
    '    monitor_pid="$!"',
    "",
    '    wait "$dev_pid" || true',
    "",
    '    if [[ -n "$monitor_pid" ]]; then',
    '      kill "$monitor_pid" 2>/dev/null || true',
    '      wait "$monitor_pid" 2>/dev/null || true',
    '      monitor_pid=""',
    "    fi",
    '    dev_pid=""',
    "",
    '    if [[ "$shutdown_requested" -eq 1 ]]; then',
    "      exit 0",
    "    fi",
    "",
    '    echo "$TITLE: Vite+ dev stack exited; restarting in ${restart_delay_seconds}s." >&2',
    '    sleep "$restart_delay_seconds"',
    "  done",
    "}",
    "",
    "run_dev() {",
    "  setup_path",
    "  ensure_expected_branch",
    `  export T3CODE_DEV_INSTANCE="${definition.slug}"`,
    `  export T3CODE_PORT_OFFSET="${definition.portOffset}"`,
    `  export T3CODE_PORT="${definition.serverPort}"`,
    `  export PORT="${definition.webPort}"`,
    `  export VITE_DEV_SERVER_URL="http://127.0.0.1:${definition.webPort}"`,
    '  export T3CODE_HOME="$HOME/.local/share/t3code-dev/${SLUG}"',
    '  export XDG_CONFIG_HOME="$HOME/.config/t3code-dev/${SLUG}"',
    ...renderOptionalExports(definition),
    `  export T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT="${definition.desktopDebuggingPort}"`,
    '  export T3CODE_DESKTOP_OPEN_DEVTOOLS="0"',
    '  export T3CODE_DEV_CHANGE_POLICY="manual"',
    '  export T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE="1"',
    '  export T3CODE_DESKTOP_RESTART_ON_EXIT="1"',
    `  export T3CODE_EXPECTED_BRANCH="${definition.branch}"`,
    '  cd "$WORKTREE"',
    "  run_supervised_dev_command",
    "}",
    "",
    'if [[ "${1:-}" == "--attached" ]] || { [ -t 1 ] && [ -t 0 ]; }; then',
    "  run_dev",
    "fi",
    "",
    "setup_path",
    "",
    "if command -v ghostty >/dev/null 2>&1; then",
    '  exec ghostty --gtk-single-instance=false --title="$TITLE" -e "$0" --attached',
    "fi",
    "",
    "if command -v kitty >/dev/null 2>&1; then",
    '  exec kitty --title "$TITLE" "$0" --attached',
    "fi",
    "",
    "run_dev",
    "",
  ].join("\n");
}

export function renderOmarchyDevLauncherDesktopEntry(
  definition: OmarchyDevLauncherDefinition,
  homeDir = NodeOS.homedir(),
): string {
  const binPath = launcherPath(definition.target, homeDir);
  const appPath = worktreePath(definition, homeDir);
  const exec =
    definition.desktopExecKind === "uwsm-ghostty"
      ? `/usr/bin/uwsm app -t service -a t3code-dev-${definition.target} -- /usr/bin/ghostty --gtk-single-instance=false "--title=${definition.title}" -e ${binPath} --attached`
      : binPath;
  const tryExec = definition.desktopExecKind === "uwsm-ghostty" ? "/usr/bin/uwsm" : binPath;

  return [
    "[Desktop Entry]",
    "Version=1.0",
    "Type=Application",
    `Name=${definition.desktopName}`,
    `Comment=${definition.desktopComment}`,
    `Exec=${exec}`,
    `TryExec=${tryExec}`,
    `Path=${appPath}`,
    "Terminal=false",
    `Icon=${NodePath.join(appPath, "apps", "desktop", "resources", "icon.png")}`,
    "StartupNotify=true",
    `StartupWMClass=t3code-dev-${definition.slug}`,
    "Categories=Development;",
    `Keywords=${definition.desktopKeywords}`,
    "",
  ].join("\n");
}

export function renderOmarchyDevLauncherFiles(
  input: {
    readonly target?: OmarchyDevLauncherTargetSelection;
    readonly homeDir?: string;
  } = {},
): ReadonlyArray<RenderedOmarchyDevLauncherFile> {
  const homeDir = input.homeDir ?? NodeOS.homedir();
  return selectedDefinitions(input.target).flatMap((definition) => [
    {
      target: definition.target,
      kind: "script",
      path: launcherPath(definition.target, homeDir),
      content: renderOmarchyDevLauncherScript(definition),
      mode: 0o755,
    },
    {
      target: definition.target,
      kind: "desktop-entry",
      path: desktopEntryPath(definition.target, homeDir),
      content: renderOmarchyDevLauncherDesktopEntry(definition, homeDir),
      mode: 0o644,
    },
  ]);
}

function backupTimestamp(now: Date): string {
  return now.toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}

function validateTargetWorktree(definition: OmarchyDevLauncherDefinition, homeDir: string): void {
  const path = worktreePath(definition, homeDir);
  if (!NodeFS.existsSync(path)) {
    throw new OmarchyDevLauncherError(`Missing ${definition.target} worktree at ${path}.`);
  }

  const branch = NodeChildProcess.execFileSync("git", ["-C", path, "branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  if (branch !== definition.branch) {
    throw new OmarchyDevLauncherError(
      `Refusing to install ${definition.target} launcher: ${path} is on '${
        branch || "detached HEAD"
      }', expected '${definition.branch}'.`,
    );
  }
}

export function installOmarchyDevLaunchers(
  options: OmarchyDevLauncherInstallOptions,
): OmarchyDevLauncherInstallResult {
  const target = options.target ?? "all";
  const homeDir = options.homeDir ?? NodeOS.homedir();
  const now = options.now ?? new Date();
  const validateWorktrees = options.validateWorktrees ?? true;
  const definitions = selectedDefinitions(target);

  if (validateWorktrees) {
    for (const definition of definitions) {
      validateTargetWorktree(definition, homeDir);
    }
  }

  const entries = renderOmarchyDevLauncherFiles({ target, homeDir }).map((file) => {
    const exists = NodeFS.existsSync(file.path);
    const current = exists ? NodeFS.readFileSync(file.path, "utf8") : null;
    const action: OmarchyDevLauncherInstallAction =
      current === file.content ? "unchanged" : exists ? "update" : "create";
    const backupPath = action === "update" ? `${file.path}.bak.${backupTimestamp(now)}` : undefined;

    if (options.mode === "write" && action !== "unchanged") {
      NodeFS.mkdirSync(NodePath.dirname(file.path), { recursive: true });
      if (exists && backupPath) {
        NodeFS.copyFileSync(file.path, backupPath);
      }
      NodeFS.writeFileSync(file.path, file.content);
      NodeFS.chmodSync(file.path, file.mode);
    }

    return {
      target: file.target,
      kind: file.kind,
      path: file.path,
      action,
      ...(backupPath ? { backupPath } : {}),
      written: options.mode === "write" && action !== "unchanged",
    };
  });

  return {
    mode: options.mode,
    target,
    entries,
  };
}

export function parseOmarchyDevLauncherArgs(
  args: ReadonlyArray<string>,
): ParsedOmarchyDevLauncherArgs {
  let target: OmarchyDevLauncherTargetSelection = "all";
  let dryRun = false;
  let write = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--target") {
      const value = args[index + 1];
      if (!value) {
        throw new OmarchyDevLauncherError("--target requires a value.");
      }
      index += 1;
      target = parseTargetSelection(value);
      continue;
    }
    if (arg.startsWith("--target=")) {
      target = parseTargetSelection(arg.slice("--target=".length));
      continue;
    }
    throw new OmarchyDevLauncherError(`Unknown option '${arg}'.`);
  }

  if (dryRun && write) {
    throw new OmarchyDevLauncherError("Use only one of --dry-run or --write.");
  }

  return {
    mode: write ? "write" : "dry-run",
    target,
    help,
  };
}

function parseTargetSelection(value: string): OmarchyDevLauncherTargetSelection {
  if (value === "all" || isOmarchyDevLauncherTarget(value)) {
    return value;
  }

  throw new OmarchyDevLauncherError(
    `Unknown target '${value}'. Expected one of: all, ${OMARCHY_DEV_LAUNCHER_TARGETS.join(", ")}.`,
  );
}

export function formatOmarchyDevLauncherInstallResult(
  result: OmarchyDevLauncherInstallResult,
): string {
  const lines = [
    `Omarchy dev launcher ${result.mode === "write" ? "install" : "dry run"} (${result.target})`,
  ];

  for (const entry of result.entries) {
    lines.push(`[${entry.action}] ${entry.kind} ${entry.target}: ${entry.path}`);
    if (entry.backupPath) {
      lines.push(`  backup: ${entry.backupPath}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function omarchyDevLauncherHelp(): string {
  return [
    "Usage: pnpm run omarchy:install-dev-launchers -- [--dry-run|--write] [--target all|main|staging|original|manual-port]",
    "",
    "Defaults to --dry-run --target all. --write is required to change ~/.local/bin or desktop entries.",
    "",
  ].join("\n");
}
