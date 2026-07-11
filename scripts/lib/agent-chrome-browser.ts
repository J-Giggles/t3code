// @effect-diagnostics nodeBuiltinImport:off - Bootstrap setup runs before an Effect platform context exists.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const AGENT_CHROME_MCP_NAME = "playwright-extension";
export const PLAYWRIGHT_MCP_PACKAGE = "@playwright/mcp@0.0.78";
export const PLAYWRIGHT_EXTENSION_ID = "mmlmfjhmonkocbjadbfplnigmagldckm";
export const PLAYWRIGHT_EXTENSION_URL = `https://chromewebstore.google.com/detail/playwright-extension/${PLAYWRIGHT_EXTENSION_ID}`;
export const PLAYWRIGHT_EXTENSION_TOKEN_ENV = "PLAYWRIGHT_MCP_EXTENSION_TOKEN";
export const GOOGLE_CHROME_DESKTOP_ID = "google-chrome.desktop";

export type AgentChromeBrowserMode = "doctor" | "dry-run" | "write";

export interface AgentChromeBrowserArgs {
  readonly help: boolean;
  readonly mode: AgentChromeBrowserMode;
}

export interface AgentChromeMcpDefinition {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly outputDir: string;
}

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface AgentChromeBrowserDependencies {
  readonly homeDir: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly run: (command: string, args: ReadonlyArray<string>) => CommandResult;
}

export interface AgentChromeBrowserSetupResult {
  readonly mode: AgentChromeBrowserMode;
  readonly mcpName: string;
  readonly packageName: string;
  readonly outputDir: string;
  readonly extensionUrl: string;
  readonly chromeAvailable: boolean;
  readonly codexAvailable: boolean;
  readonly npxAvailable: boolean;
  readonly packageAvailable: boolean;
  readonly xdgSettingsAvailable: boolean;
  readonly xdgMimeAvailable: boolean;
  readonly configured: boolean;
  readonly defaultBrowserConfigured: boolean;
  readonly ready: boolean;
  readonly automaticApproval: boolean;
  readonly changed: boolean;
}

function defaultRun(command: string, args: ReadonlyArray<string>): CommandResult {
  const result = NodeChildProcess.spawnSync(command, [...args], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error instanceof Error ? result.error.message : ""),
  };
}

export function buildAgentChromeMcpDefinition(homeDir: string): AgentChromeMcpDefinition {
  const outputDir = NodePath.join(homeDir, ".local", "share", "t3code-agent-browser", "mcp-output");
  return {
    command: "npx",
    args: [
      "-y",
      PLAYWRIGHT_MCP_PACKAGE,
      "--extension",
      "--viewport-size",
      "1440x900",
      "--codegen",
      "none",
      "--console-level",
      "warning",
      "--image-responses",
      "omit",
      "--output-mode",
      "file",
      "--output-dir",
      outputDir,
      "--timeout-action",
      "10000",
      "--timeout-navigation",
      "60000",
    ],
    outputDir,
  };
}

export function buildAgentChromeMcpAddArgs(
  definition: AgentChromeMcpDefinition,
  extensionToken?: string,
): ReadonlyArray<string> {
  return [
    "mcp",
    "add",
    AGENT_CHROME_MCP_NAME,
    ...(extensionToken ? ["--env", `${PLAYWRIGHT_EXTENSION_TOKEN_ENV}=${extensionToken}`] : []),
    "--",
    definition.command,
    ...definition.args,
  ];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): ReadonlyArray<string> | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function extensionTokenFromConfig(value: unknown): string | undefined {
  const transport = asRecord(asRecord(value)?.transport);
  const environment = asRecord(transport?.env);
  const token = environment?.[PLAYWRIGHT_EXTENSION_TOKEN_ENV];
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

export function isExpectedAgentChromeMcpConfig(
  value: unknown,
  definition: AgentChromeMcpDefinition,
  requireToken: boolean,
): boolean {
  const config = asRecord(value);
  const transport = asRecord(config?.transport);
  const args = stringArray(transport?.args);
  if (
    config?.name !== AGENT_CHROME_MCP_NAME ||
    transport?.type !== "stdio" ||
    transport.command !== definition.command ||
    args === undefined ||
    args.length !== definition.args.length ||
    args.some((argument, index) => argument !== definition.args[index])
  ) {
    return false;
  }
  return requireToken ? extensionTokenFromConfig(value) !== undefined : true;
}

export function parseAgentChromeBrowserArgs(args: ReadonlyArray<string>): AgentChromeBrowserArgs {
  if (args.includes("--token") || args.some((argument) => argument.startsWith("--token="))) {
    throw new Error(
      `Do not pass browser tokens on the command line; set ${PLAYWRIGHT_EXTENSION_TOKEN_ENV} instead.`,
    );
  }
  const allowed = new Set(["--doctor", "--dry-run", "--write", "--help", "-h"]);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown) {
    throw new Error(`Unknown agent Chrome browser option: ${unknown}`);
  }
  const modes = ["--doctor", "--dry-run", "--write"].filter((mode) => args.includes(mode));
  if (modes.length > 1) {
    throw new Error("Choose exactly one mode: --doctor, --dry-run, or --write.");
  }
  const selected = modes[0];
  return {
    help: args.includes("--help") || args.includes("-h"),
    mode: selected === "--write" ? "write" : selected === "--dry-run" ? "dry-run" : "doctor",
  };
}

function commandAvailable(run: AgentChromeBrowserDependencies["run"], command: string): boolean {
  return run(command, ["--version"]).exitCode === 0;
}

function readMcpConfig(run: AgentChromeBrowserDependencies["run"]): unknown | undefined {
  const result = run("codex", ["mcp", "get", AGENT_CHROME_MCP_NAME, "--json"]);
  if (result.exitCode !== 0) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(`Codex returned invalid JSON for MCP server ${AGENT_CHROME_MCP_NAME}.`);
  }
}

function defaultBrowserConfigured(run: AgentChromeBrowserDependencies["run"]): boolean {
  const desktop = run("xdg-settings", ["get", "default-web-browser"]);
  const http = run("xdg-mime", ["query", "default", "x-scheme-handler/http"]);
  const https = run("xdg-mime", ["query", "default", "x-scheme-handler/https"]);
  return [desktop, http, https].every(
    (result) => result.exitCode === 0 && result.stdout.trim() === GOOGLE_CHROME_DESKTOP_ID,
  );
}

function configureDefaultBrowser(run: AgentChromeBrowserDependencies["run"]): void {
  const commands: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["xdg-settings", ["set", "default-web-browser", GOOGLE_CHROME_DESKTOP_ID]],
    ["xdg-mime", ["default", GOOGLE_CHROME_DESKTOP_ID, "x-scheme-handler/http"]],
    ["xdg-mime", ["default", GOOGLE_CHROME_DESKTOP_ID, "x-scheme-handler/https"]],
  ];
  for (const [command, args] of commands) {
    if (run(command, args).exitCode !== 0) {
      throw new Error(`Failed to make Google Chrome the default browser via ${command}.`);
    }
  }
}

export function setupAgentChromeBrowser(
  mode: AgentChromeBrowserMode,
  dependencies: Partial<AgentChromeBrowserDependencies> = {},
): AgentChromeBrowserSetupResult {
  const homeDir = dependencies.homeDir ?? NodeOS.homedir();
  const environment = dependencies.environment ?? process.env;
  const run = dependencies.run ?? defaultRun;
  const definition = buildAgentChromeMcpDefinition(homeDir);
  const chromeAvailable = commandAvailable(run, "google-chrome-stable");
  const codexAvailable = commandAvailable(run, "codex");
  const npxAvailable = commandAvailable(run, "npx");
  const xdgSettingsAvailable = commandAvailable(run, "xdg-settings");
  const xdgMimeAvailable = commandAvailable(run, "xdg-mime");
  const packageAvailable =
    npxAvailable && run("npx", ["-y", PLAYWRIGHT_MCP_PACKAGE, "--version"]).exitCode === 0;
  const existingConfig = codexAvailable ? readMcpConfig(run) : undefined;
  const environmentToken = environment[PLAYWRIGHT_EXTENSION_TOKEN_ENV]?.trim() || undefined;
  const preservedToken = extensionTokenFromConfig(existingConfig);
  const extensionToken = environmentToken ?? preservedToken;

  if (mode === "write") {
    const missing = [
      !chromeAvailable ? "google-chrome-stable" : undefined,
      !codexAvailable ? "codex" : undefined,
      !npxAvailable ? "npx" : undefined,
      !xdgSettingsAvailable ? "xdg-settings" : undefined,
      !xdgMimeAvailable ? "xdg-mime" : undefined,
      !packageAvailable ? PLAYWRIGHT_MCP_PACKAGE : undefined,
    ].filter((value): value is string => value !== undefined);
    if (missing.length > 0) {
      throw new Error(`Cannot install the agent Chrome browser; missing: ${missing.join(", ")}.`);
    }
    NodeFS.mkdirSync(definition.outputDir, { recursive: true, mode: 0o700 });
    const install = run("codex", buildAgentChromeMcpAddArgs(definition, extensionToken));
    if (install.exitCode !== 0) {
      throw new Error(`Codex failed to configure MCP server ${AGENT_CHROME_MCP_NAME}.`);
    }
    configureDefaultBrowser(run);
  }

  const finalConfig = mode === "write" ? readMcpConfig(run) : existingConfig;
  const configured = isExpectedAgentChromeMcpConfig(
    finalConfig,
    definition,
    extensionToken !== undefined,
  );
  const browserConfigured =
    xdgSettingsAvailable && xdgMimeAvailable && defaultBrowserConfigured(run);
  return {
    mode,
    mcpName: AGENT_CHROME_MCP_NAME,
    packageName: PLAYWRIGHT_MCP_PACKAGE,
    outputDir: definition.outputDir,
    extensionUrl: PLAYWRIGHT_EXTENSION_URL,
    chromeAvailable,
    codexAvailable,
    npxAvailable,
    packageAvailable,
    xdgSettingsAvailable,
    xdgMimeAvailable,
    configured,
    defaultBrowserConfigured: browserConfigured,
    ready: configured && browserConfigured,
    automaticApproval: extensionToken !== undefined,
    changed: mode === "write",
  };
}

export function agentChromeBrowserHelp(): string {
  return [
    "Usage: pnpm run agent-browser:setup -- [--doctor|--dry-run|--write]",
    "",
    "  --doctor   Check Chrome, Codex, the pinned Playwright MCP, and MCP configuration.",
    "  --dry-run  Show the intended configuration without changing Codex.",
    "  --write    Install or replace the dedicated playwright-extension MCP entry.",
    "",
    `For automatic connection approval, export ${PLAYWRIGHT_EXTENSION_TOKEN_ENV} before --write.`,
    "Never pass the token as a command-line argument.",
    "",
  ].join("\n");
}

function status(ok: boolean): string {
  return ok ? "ok" : "missing";
}

export function formatAgentChromeBrowserSetupResult(result: AgentChromeBrowserSetupResult): string {
  return [
    `Agent Chrome browser (${result.mode})`,
    `Chrome: ${status(result.chromeAvailable)}`,
    `Codex: ${status(result.codexAvailable)}`,
    `npx: ${status(result.npxAvailable)}`,
    `${result.packageName}: ${status(result.packageAvailable)}`,
    `${result.mcpName}: ${result.configured ? "configured" : "not configured"}`,
    `Default HTTP/HTTPS browser: ${
      result.defaultBrowserConfigured ? "Google Chrome" : "not Google Chrome"
    }`,
    `Automatic connection approval: ${result.automaticApproval ? "configured" : "manual approval required"}`,
    `Artifacts: ${result.outputDir}`,
    `Extension: ${result.extensionUrl}`,
    ...(result.mode === "dry-run"
      ? ["No changes made. Run again with --write to configure Codex."]
      : []),
    "",
  ].join("\n");
}
