// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Installer artifacts are synchronous and ordered.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export type MainUptimeInstallMode = "dry-run" | "write";
export type MainUptimeInstallAction = "create" | "update" | "unchanged";

export interface MainUptimeRenderedFile {
  readonly path: string;
  readonly content: string;
  readonly mode: number;
}

export interface MainUptimeInstallEntry extends MainUptimeRenderedFile {
  readonly action: MainUptimeInstallAction;
  readonly backupPath?: string;
  readonly written: boolean;
}

export interface MainUptimeInstallOptions {
  readonly mode: MainUptimeInstallMode;
  readonly homeDir?: string;
  readonly repoRoot?: string;
  readonly now?: Date;
  readonly validateMain?: boolean;
}

export interface MainUptimeInstallResult {
  readonly mode: MainUptimeInstallMode;
  readonly repoRoot: string;
  readonly approvedHead: string;
  readonly approvedHeadInitialized: boolean;
  readonly entries: ReadonlyArray<MainUptimeInstallEntry>;
}

export interface ParsedMainUptimeArgs {
  readonly mode: MainUptimeInstallMode;
  readonly homeDir?: string;
  readonly repoRoot?: string;
  readonly help: boolean;
}

export class MainUptimeInstallError extends Error {
  override readonly name = "MainUptimeInstallError";
}

const moduleDir = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const templateDir = NodePath.join(moduleDir, "templates");

const FILES = [
  ["t3code-main-uptime.sh", [".local", "bin", "t3code-main-uptime"], 0o755],
  ["t3code-main.service", [".config", "systemd", "user", "t3code-main.service"], 0o644],
  ["t3code-main-guard.service", [".config", "systemd", "user", "t3code-main-guard.service"], 0o644],
  ["t3code-main-guard.timer", [".config", "systemd", "user", "t3code-main-guard.timer"], 0o644],
  [
    "t3code-main-health.service",
    [".config", "systemd", "user", "t3code-main-health.service"],
    0o644,
  ],
  ["t3code-main-health.timer", [".config", "systemd", "user", "t3code-main-health.timer"], 0o644],
] as const;

function backupTimestamp(now: Date): string {
  return now.toISOString().replaceAll(/[-:.]/g, "");
}

function readGit(repoRoot: string, args: ReadonlyArray<string>): string {
  const result = NodeChildProcess.spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new MainUptimeInstallError(
      `git -C ${repoRoot} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function inspectMain(repoRoot: string): { readonly head: string; readonly branch: string } {
  if (!NodeFS.existsSync(repoRoot)) {
    throw new MainUptimeInstallError(`Missing live Main checkout at ${repoRoot}.`);
  }
  const branch = readGit(repoRoot, ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new MainUptimeInstallError(
      `Refusing to install Main uptime controls: ${repoRoot} is on '${branch || "detached HEAD"}'.`,
    );
  }
  const status = readGit(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const unmerged = readGit(repoRoot, ["ls-files", "-u"]);
  if (status || unmerged) {
    throw new MainUptimeInstallError(
      `Refusing to initialize Main uptime controls from a dirty checkout at ${repoRoot}.`,
    );
  }
  return { branch, head: readGit(repoRoot, ["rev-parse", "HEAD"]) };
}

export function renderMainUptimeFiles(
  input: {
    readonly homeDir?: string;
    readonly repoRoot?: string;
  } = {},
): ReadonlyArray<MainUptimeRenderedFile> {
  const homeDir = input.homeDir ?? NodeOS.homedir();
  const repoRoot = input.repoRoot ?? NodePath.join(homeDir, "code", "t3code");
  return FILES.map(([templateName, relativePath, mode]) => ({
    path: NodePath.join(homeDir, ...relativePath),
    content: NodeFS.readFileSync(NodePath.join(templateDir, templateName), "utf8")
      .replaceAll("@@HOME_DIR@@", homeDir)
      .replaceAll("@@REPO_ROOT@@", repoRoot),
    mode,
  }));
}

export function installMainUptime(options: MainUptimeInstallOptions): MainUptimeInstallResult {
  const homeDir = options.homeDir ?? NodeOS.homedir();
  const repoRoot = options.repoRoot ?? NodePath.join(homeDir, "code", "t3code");
  const now = options.now ?? new Date();
  const validateMain = options.validateMain ?? true;
  const main = validateMain ? inspectMain(repoRoot) : { branch: "main", head: "0".repeat(40) };
  const files = renderMainUptimeFiles({ homeDir, repoRoot });
  const entries = files.map((file): MainUptimeInstallEntry => {
    const exists = NodeFS.existsSync(file.path);
    const current = exists ? NodeFS.readFileSync(file.path, "utf8") : null;
    const action: MainUptimeInstallAction =
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
      ...file,
      action,
      ...(backupPath ? { backupPath } : {}),
      written: options.mode === "write" && action !== "unchanged",
    };
  });

  const approvedPath = NodePath.join(
    homeDir,
    ".local",
    "state",
    "t3code-main-uptime",
    "approved-head",
  );
  const approvedHeadInitialized = options.mode === "write" && !NodeFS.existsSync(approvedPath);
  if (approvedHeadInitialized) {
    NodeFS.mkdirSync(NodePath.dirname(approvedPath), { recursive: true });
    NodeFS.writeFileSync(approvedPath, `${main.head}\n`, { mode: 0o644 });
  }
  const approvedHead = NodeFS.existsSync(approvedPath)
    ? NodeFS.readFileSync(approvedPath, "utf8").trim()
    : main.head;
  if (!/^[0-9a-f]{40}$/u.test(approvedHead)) {
    throw new MainUptimeInstallError(`Invalid approved Main SHA at ${approvedPath}.`);
  }

  return {
    mode: options.mode,
    repoRoot,
    approvedHead,
    approvedHeadInitialized,
    entries,
  };
}

export function parseMainUptimeArgs(args: ReadonlyArray<string>): ParsedMainUptimeArgs {
  let mode: MainUptimeInstallMode = "dry-run";
  let homeDir: string | undefined;
  let repoRoot: string | undefined;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dry-run") {
      mode = "dry-run";
      continue;
    }
    if (arg === "--write") {
      mode = "write";
      continue;
    }
    if (arg === "--home-dir" || arg === "--repo-root") {
      const value = args[index + 1];
      if (!value) throw new MainUptimeInstallError(`${arg} requires a value.`);
      index += 1;
      if (arg === "--home-dir") homeDir = value;
      else repoRoot = value;
      continue;
    }
    throw new MainUptimeInstallError(`Unknown option '${arg}'.`);
  }

  return {
    mode,
    ...(homeDir ? { homeDir } : {}),
    ...(repoRoot ? { repoRoot } : {}),
    help,
  };
}

export function formatMainUptimeInstallResult(result: MainUptimeInstallResult): string {
  const lines = [
    `T3 Code Main uptime ${result.mode === "write" ? "install" : "dry run"}`,
    `Live checkout: ${result.repoRoot}`,
    `Approved SHA: ${result.approvedHead}${result.approvedHeadInitialized ? " (initialized)" : ""}`,
  ];
  for (const entry of result.entries) {
    lines.push(`[${entry.action}] ${entry.path}`);
    if (entry.backupPath) lines.push(`  backup: ${entry.backupPath}`);
  }
  if (result.mode === "write") {
    lines.push(
      "Run systemctl --user daemon-reload, then enable t3code-main.service and both timers.",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function mainUptimeHelp(): string {
  return [
    "Usage: pnpm run main-uptime:install -- [--dry-run|--write] [--home-dir PATH] [--repo-root PATH]",
    "",
    "Defaults to a dry run for ~/code/t3code. --write installs the Main supervisor and guard units.",
    "",
  ].join("\n");
}
