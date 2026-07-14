// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off - Headed E2E harness owns process and filesystem setup.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { chromium, expect, test as base, type Browser, type Page } from "playwright/test";

const desktopDir = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../..",
);
const repoRoot = NodePath.resolve(desktopDir, "../..");
const BASE_SERVER_PORT = 13_773;
const BASE_WEB_PORT = 5_733;
const OUTER_LAUNCH_ENV_KEYS = [
  "T3CODE_APP_ROOT",
  "T3CODE_DESKTOP_VARIANT",
  "T3CODE_DEV_INSTANCE",
  "T3CODE_EXPECTED_BRANCH",
  "T3CODE_RESTART_CONTROL_KIND",
  "T3CODE_RESTART_CONTROL_TOKEN",
  "T3CODE_RESTART_CONTROL_URL",
  "T3CODE_TAILSCALE_SERVE_PATH",
  "T3CODE_WORKSPACE_SLUG",
  "T3CODE_WORKTREE_ROLE",
  "VITE_DEV_SERVER_URL",
  "VITE_HTTP_URL",
  "VITE_T3CODE_PUBLIC_BASE_PATH",
  "VITE_T3CODE_PUBLIC_ORIGIN",
  "VITE_WS_URL",
] as const;

export interface ElectronHarnessRuntime {
  readonly repoRoot: string;
  readonly desktopDir: string;
  readonly runId: string;
  readonly rootDir: string;
  readonly homeDir: string;
  readonly xdgConfigDir: string;
  readonly t3Home: string;
  readonly artifactDir: string;
  readonly serverPort: number;
  readonly webPort: number;
  readonly devServerUrl: string;
  readonly remoteDebuggingPort: number;
}

export interface ElectronHarness extends ElectronHarnessRuntime {
  readonly page: Page;
  readonly goto: (path: string) => Promise<void>;
  readonly waitForRelaunch: () => Promise<Page>;
  readonly registerTailscaleServePath: (path: string) => void;
}

type SeedHook = (runtime: ElectronHarnessRuntime) => Promise<void>;

interface WorkerOptions {
  readonly e2eSeed?: { readonly run: SeedHook };
}

interface Fixtures {
  readonly page: Page;
  readonly harness: ElectronHarness;
}

async function canListen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = NodeNet.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findPortOffset(workerIndex: number): Promise<number> {
  const start = 3_000 + workerIndex * 100;
  for (let offset = start; offset < start + 2_000; offset += 1) {
    if ((await canListen(BASE_SERVER_PORT + offset)) && (await canListen(BASE_WEB_PORT + offset))) {
      return offset;
    }
  }
  throw new Error(`Could not find a free desktop E2E port offset from ${start}.`);
}

async function fetchCdpList(port: number): Promise<unknown[]> {
  const url = `http://127.0.0.1:${port}/json/list`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  const response = await fetch(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown[];
}

async function waitForCdpList(port: number): Promise<unknown[]> {
  const url = `http://127.0.0.1:${port}/json/list`;
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 300_000) {
    try {
      return await fetchCdpList(port);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    [
      `Timed out waiting for Electron CDP inspection endpoint at ${url}.`,
      `Last HTTP error: ${String(lastError)}`,
      "Likely causes: Electron did not finish booting, the app crashed before opening the debugger endpoint, or the configured remote debugging port is wrong.",
    ].join("\n"),
  );
}

async function readDevToolsActivePort(filePath: string): Promise<number | undefined> {
  const contents = await NodeFSP.readFile(filePath, "utf8").catch(() => undefined);
  const firstLine = contents?.split(/\r?\n/u)[0]?.trim();
  if (!firstLine) return undefined;
  const port = Number.parseInt(firstLine, 10);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}

async function waitForActiveCdpPort(input: {
  readonly filePath: string;
  readonly previousPort?: number;
}): Promise<number> {
  const startedAt = Date.now();
  let lastError: unknown;
  let lastAttemptedPort: number | undefined;
  let lastHttpError: unknown;
  while (Date.now() - startedAt < 300_000) {
    const port = await readDevToolsActivePort(input.filePath);
    if (port === undefined) {
      lastError = new Error(`DevToolsActivePort is not ready at ${input.filePath}`);
    } else if (input.previousPort !== undefined && port === input.previousPort) {
      lastError = new Error(`DevToolsActivePort still points to previous port ${port}`);
    } else {
      lastAttemptedPort = port;
      try {
        await fetchCdpList(port);
        return port;
      } catch (error) {
        lastHttpError = error;
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    [
      "Timed out waiting for active Electron CDP inspection port.",
      `DevToolsActivePort file: ${input.filePath}`,
      `Last attempted port: ${lastAttemptedPort ?? "none"}`,
      `Last active-port/read error: ${String(lastError)}`,
      `Last HTTP error: ${lastHttpError === undefined ? "none" : String(lastHttpError)}`,
      "Likely causes: Electron did not finish booting, the renderer crashed, the debugger endpoint is still bound to a previous run, or another process consumed the requested port.",
    ].join("\n"),
  );
}

async function waitForRendererPage(browser: Browser, webPort: number): Promise<Page> {
  const expectedPrefix = `http://127.0.0.1:${webPort}/`;
  const expectedDesktopPrefix = "t3code-dev://app/";
  const startedAt = Date.now();
  while (Date.now() - startedAt < 300_000) {
    if (!browser.isConnected()) {
      throw new Error(`Electron CDP browser disconnected while waiting for ${expectedPrefix}.`);
    }
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        const url = candidate.url();
        if (!url.startsWith(expectedPrefix) && !url.startsWith(expectedDesktopPrefix)) continue;
        const hasDesktopBridge = await candidate
          .evaluate(() => Boolean(window.desktopBridge))
          .catch(() => false);
        if (!hasDesktopBridge) continue;
        await candidate.waitForLoadState("domcontentloaded").catch(() => undefined);
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Electron renderer page at ${expectedPrefix}.`);
}

async function waitForRendererReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForSelector("body", { state: "attached", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.desktopBridge), undefined, { timeout: 60_000 });
}

async function waitForAppShellReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      if (!window.desktopBridge) return false;
      const bodyText = document.body.innerText;
      if (
        /No active thread|Pick a thread to continue|No projects yet/u.test(bodyText) ||
        document.querySelector('[data-testid="composer-editor"]') ||
        document.querySelector('[data-testid="new-thread-button"]') ||
        document.querySelector('[data-testid="sidebar-add-project-trigger"]')
      ) {
        return true;
      }
      return false;
    },
    undefined,
    { timeout: 120_000 },
  );
}

function killProcessTree(
  child: NodeChildProcess.ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- The harness tears down process trees from a standalone Node test worker.
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // Fall back to direct-child cleanup below when the process group is already gone.
    }
    NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-P", String(child.pid)], {
      stdio: "ignore",
    });
  }
  try {
    child.kill(signal);
  } catch {
    // The process may have exited after the process-group signal.
  }
}

function killRuntimeProcesses(rootDir: string, signal: NodeJS.Signals = "SIGTERM"): void {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Linux procfs cleanup is a test harness fallback for detached Electron grandchildren.
  if (process.platform !== "linux") return;

  for (const entry of NodeFS.readdirSync("/proc", { withFileTypes: true })) {
    if (!/^\d+$/u.test(entry.name)) continue;

    try {
      // procfs entries can disappear even while Dirent resolves their type.
      if (!entry.isDirectory()) continue;
      const pid = Number.parseInt(entry.name, 10);
      if (pid === process.pid) continue;
      const environment = NodeFS.readFileSync(NodePath.join("/proc", entry.name, "environ"));
      if (!environment.includes(rootDir)) continue;
      process.kill(pid, signal);
    } catch {
      // Processes can exit or deny access while procfs is being scanned.
    }
  }
}

async function waitForExit(child: NodeChildProcess.ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function copyLogs(runtime: ElectronHarnessRuntime): Promise<void> {
  const logDir = NodePath.join(runtime.t3Home, "dev", "logs");
  if (!NodeFS.existsSync(logDir)) return;
  const target = NodePath.join(runtime.artifactDir, "logs");
  await NodeFSP.rm(target, { recursive: true, force: true });
  await NodeFSP.cp(logDir, target, { recursive: true });
}

async function writeProcessLog(
  runtime: ElectronHarnessRuntime,
  streamName: "stdout" | "stderr",
  chunk: Buffer,
): Promise<void> {
  await NodeFSP.appendFile(
    NodePath.join(runtime.artifactDir, `dev-runner.${streamName}.log`),
    chunk,
  );
}

async function removeTempRoot(rootDir: string): Promise<void> {
  await NodeFSP.rm(rootDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  }).catch(() => undefined);
}

async function stopActiveDevLaunches(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const desktop = window.desktopBridge;
      if (!desktop) return;
      const state = await desktop.listActiveDevLaunches();
      await Promise.all(
        state.active.map((launch) => desktop.stopDevApp({ threadRef: launch.threadRef })),
      );
    })
    .catch(() => undefined);
}

async function disableTailscalePaths(paths: ReadonlySet<string>): Promise<void> {
  if (process.env.T3CODE_E2E_ALLOW_TAILSCALE_MUTATION !== "1") return;
  for (const servePath of paths) {
    await new Promise<void>((resolve) => {
      const child = NodeChildProcess.spawn(
        "tailscale",
        ["serve", "--https=443", `--set-path=${servePath}`, "off"],
        {
          stdio: "ignore",
        },
      );
      child.on("error", () => resolve());
      child.on("exit", () => resolve());
    });
  }
}

async function startElectronHarness(
  workerIndex: number,
  seed?: { readonly run: SeedHook },
): Promise<{ harness: ElectronHarness; close: () => Promise<void> }> {
  const runId = `e2e-${process.pid}-${workerIndex}-${Date.now().toString(36)}`;
  const rootDir = await NodeFSP.mkdtemp(NodePath.join("/tmp", `t3code-desktop-${runId}-`));
  const homeDir = NodePath.join(rootDir, "home");
  const xdgConfigDir = NodePath.join(rootDir, "xdg-config");
  const t3Home = NodePath.join(rootDir, "t3-home");
  const artifactDir = NodePath.join(rootDir, "artifacts");
  await Promise.all([
    NodeFSP.mkdir(homeDir, { recursive: true }),
    NodeFSP.mkdir(xdgConfigDir, { recursive: true }),
    NodeFSP.mkdir(t3Home, { recursive: true }),
    NodeFSP.mkdir(artifactDir, { recursive: true }),
  ]);

  const offset = await findPortOffset(workerIndex);
  const serverPort = BASE_SERVER_PORT + offset;
  const webPort = BASE_WEB_PORT + offset;
  const devServerUrl = `http://127.0.0.1:${webPort}`;
  const devToolsActivePortPath = NodePath.join(xdgConfigDir, "Electron", "DevToolsActivePort");
  let activeRemoteDebuggingPort = 0;
  const runtime: ElectronHarnessRuntime = {
    repoRoot,
    desktopDir,
    runId,
    rootDir,
    homeDir,
    xdgConfigDir,
    t3Home,
    artifactDir,
    serverPort,
    webPort,
    devServerUrl,
    get remoteDebuggingPort() {
      return activeRemoteDebuggingPort;
    },
  };

  await seed?.run(runtime);

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of OUTER_LAUNCH_ENV_KEYS) {
    delete childEnv[key];
  }

  const child = NodeChildProcess.spawn(process.execPath, ["scripts/dev-runner.ts", "dev:desktop"], {
    cwd: repoRoot,
    // oxlint-disable-next-line t3code/no-global-process-runtime -- The harness uses Node process groups to own the dev-runner tree.
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...childEnv,
      HOME: homeDir,
      XDG_CONFIG_HOME: xdgConfigDir,
      T3CODE_HOME: t3Home,
      T3CODE_PORT_OFFSET: String(offset),
      T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT: "0",
      T3CODE_DISABLE_AUTO_UPDATE: "1",
      T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "0",
      ELECTRON_ENABLE_LOGGING: "1",
    },
  });
  child.stdout.on("data", (chunk: Buffer) => {
    void writeProcessLog(runtime, "stdout", chunk).catch(() => undefined);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    void writeProcessLog(runtime, "stderr", chunk).catch(() => undefined);
  });

  const tailscaleServePaths = new Set<string>();
  let browser: Browser | null = null;
  let page: Page | null = null;
  let closed = false;

  const connectToElectron = async (previousPort?: number) => {
    const startedAt = Date.now();
    let lastError: unknown;
    while (Date.now() - startedAt < 300_000) {
      let nextBrowser: Browser | null = null;
      try {
        const port = await waitForActiveCdpPort({
          filePath: devToolsActivePortPath,
          previousPort,
        });
        await waitForCdpList(port);
        nextBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        const nextPage = await waitForRendererPage(nextBrowser, webPort);
        await waitForRendererReady(nextPage);
        await waitForAppShellReady(nextPage);
        activeRemoteDebuggingPort = port;
        return { browser: nextBrowser, page: nextPage };
      } catch (error) {
        lastError = error;
        await nextBrowser?.close().catch(() => undefined);
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error("Electron dev runner exited before CDP became stable.", {
            cause: error,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    throw new Error(`Timed out connecting to a stable Electron renderer: ${String(lastError)}`);
  };

  try {
    const connected = await connectToElectron();
    browser = connected.browser;
    page = connected.page;
  } catch (error) {
    killProcessTree(child);
    killRuntimeProcesses(rootDir);
    await waitForExit(child, 2_000);
    await copyLogs(runtime).catch(() => undefined);
    throw error;
  }

  const harness: ElectronHarness = {
    ...runtime,
    get page() {
      if (!page) {
        throw new Error("Electron renderer page is not available.");
      }
      return page;
    },
    goto: async (routePath: string) => {
      const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
      await page!.goto(`${devServerUrl}/#${normalized}`);
      await page!.waitForLoadState("domcontentloaded");
    },
    waitForRelaunch: async () => {
      const previousPage = page;
      const previousPort = activeRemoteDebuggingPort;
      await previousPage?.waitForEvent("close", { timeout: 30_000 }).catch(() => undefined);

      const connected = await connectToElectron(previousPort || undefined);
      browser = connected.browser;
      page = connected.page;
      return connected.page;
    },
    registerTailscaleServePath: (servePath: string) => {
      tailscaleServePaths.add(servePath);
    },
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    if (page) {
      await stopActiveDevLaunches(page);
    }
    await disableTailscalePaths(tailscaleServePaths);
    await browser?.close().catch(() => undefined);
    killProcessTree(child);
    killRuntimeProcesses(rootDir);
    await waitForExit(child, 5_000);
    if (child.exitCode === null && child.signalCode === null) {
      killProcessTree(child, "SIGKILL");
      await waitForExit(child, 2_000);
    }
    killRuntimeProcesses(rootDir, "SIGKILL");
    await copyLogs(runtime).catch(() => undefined);
    if (process.env.T3CODE_E2E_KEEP_ARTIFACTS !== "1") {
      await removeTempRoot(rootDir);
    }
  };

  return { harness, close };
}

export const test = base.extend<Fixtures, WorkerOptions>({
  e2eSeed: [undefined, { option: true, scope: "worker" }],
  harness: [
    async ({ e2eSeed }, use, workerInfo) => {
      const started = await startElectronHarness(workerInfo.workerIndex, e2eSeed);
      try {
        await use(started.harness);
      } finally {
        await started.close();
      }
    },
    { scope: "worker" },
  ],
  page: async ({ harness }, use) => {
    await use(harness.page);
  },
});

export { expect };
