#!/usr/bin/env node
// @ts-nocheck
/** Agent launcher for the t3code-main worktree (staging code + main Convex copy). */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { ensureConvexReadyForLauncher } from "../../t3code-staging/scripts/local-desktop-launcher-convex.ts";
import { resolveLocalDesktopAppUrlsForVariant } from "../../t3code-staging/scripts/local-desktop-env.ts";
import {
  LOCAL_DESKTOP_CONVEX_PORTS,
  type LocalDesktopLauncherTarget,
} from "../../t3code-staging/scripts/local-desktop-launchers.ts";

const SCRIPT_DIR = NodePath.resolve(import.meta.dirname);
const WORKSPACE_ROOT = NodePath.resolve(SCRIPT_DIR, "../..");
const STAGING_WORKTREE = NodePath.join(WORKSPACE_ROOT, "t3code-staging");
const MAIN_WORKTREE = NodePath.join(WORKSPACE_ROOT, "t3code");
const T3CODE_MAIN_WORKTREE = NodePath.join(WORKSPACE_ROOT, "t3code-main");

function resolveTarget(): LocalDesktopLauncherTarget {
  const home = process.env.HOME ?? "";
  const t3Home = process.env.T3CODE_HOME ?? `${home}/.local/share/t3code-local/t3code-main`;
  const convexDataDir =
    process.env.T3CODE_CONVEX_DATA_DIR ?? `${T3CODE_MAIN_WORKTREE}/.local/convex`;

  return {
    id: "t3code-local-main",
    desktopVariant: "local-main",
    displayName: "T3code Main (t3code-main worktree)",
    comment: "Staging branch code with copied main Convex data.",
    worktreePath: T3CODE_MAIN_WORKTREE,
    launcherWorktreePath: STAGING_WORKTREE,
    localMainWorktreePath: MAIN_WORKTREE,
    localStagingWorktreePath: STAGING_WORKTREE,
    localMainConvexDataDir: convexDataDir,
    localStagingConvexDataDir: `${STAGING_WORKTREE}/.local/convex`,
    t3Home,
    convexDataDir,
    convexUrl: process.env.CONVEX_URL ?? `http://127.0.0.1:${LOCAL_DESKTOP_CONVEX_PORTS.main.cloud}`,
    convexSiteUrl:
      process.env.CONVEX_SITE_URL ?? `http://127.0.0.1:${LOCAL_DESKTOP_CONVEX_PORTS.main.site}`,
    devInstance: "t3code-local-main",
    startupWmClass: "t3code-local-t3code-main",
    remoteDebuggingPort: Number(process.env.T3CODE_REMOTE_DEBUGGING_PORT ?? 9224),
  };
}

async function waitForVite(url: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for Vite at ${url}`);
}

async function main(): Promise<void> {
  const target = resolveTarget();
  const wait = process.argv.includes("--wait");

  NodeFS.mkdirSync(NodePath.join(target.t3Home, "logs"), { recursive: true });
  const runtimeLog = NodePath.join(target.t3Home, "logs/runtime.log");
  const log = (message: string) => {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    NodeFS.appendFileSync(runtimeLog, line, "utf8");
    console.log(message);
  };

  log(`Ensuring Convex at ${target.convexUrl}`);
  const convex = await ensureConvexReadyForLauncher({
    worktreePath: target.worktreePath,
    convexDataDir: target.convexDataDir,
    convexUrl: target.convexUrl,
    env: {
      ...process.env,
      T3CODE_CONVEX_DATA_DIR: target.convexDataDir,
      CONVEX_URL: target.convexUrl,
      CONVEX_SITE_URL: target.convexSiteUrl,
    },
    onProgress: log,
  });

  const devRunner = NodePath.join(STAGING_WORKTREE, "scripts/dev-runner.ts");

  log("Starting dev stack from t3code-main");
  const child = NodeChildProcess.spawn(process.execPath, [devRunner, "dev:desktop-stack"], {
    cwd: target.worktreePath,
    env: {
      ...process.env,
      T3CODE_HOME: target.t3Home,
      T3CODE_CONVEX_DATA_DIR: target.convexDataDir,
      CONVEX_URL: target.convexUrl,
      CONVEX_SITE_URL: target.convexSiteUrl,
      T3CODE_PERSISTENCE: "convex",
      T3CODE_DESKTOP_VARIANT: target.desktopVariant,
      T3CODE_DEV_INSTANCE: target.devInstance,
      T3CODE_DEV_STACK: "stable",
      T3CODE_LOCAL_MAIN_WORKTREE: target.localMainWorktreePath,
      T3CODE_LOCAL_STAGING_WORKTREE: target.localStagingWorktreePath,
      T3CODE_LOCAL_MAIN_CONVEX_DATA_DIR: target.localMainConvexDataDir,
      T3CODE_LOCAL_STAGING_CONVEX_DATA_DIR: target.localStagingConvexDataDir,
      T3CODE_LOCAL_MAIN_CONVEX_URL: target.convexUrl,
      T3CODE_LOCAL_MAIN_CONVEX_SITE_URL: target.convexSiteUrl,
      T3CODE_TURBO_UI: process.env.T3CODE_TURBO_UI ?? "stream",
      T3CODE_NO_BROWSER: "1",
      T3CODE_AGENT_AUTOMATION: process.env.T3CODE_AGENT_AUTOMATION ?? "1",
      T3CODE_REMOTE_DEBUGGING_PORT: String(target.remoteDebuggingPort),
    },
    stdio: "inherit",
  });

  const stopAll = () => {
    convex.stopManagedProcess();
    child.kill("SIGTERM");
  };
  process.on("SIGINT", stopAll);
  process.on("SIGTERM", stopAll);

  if (wait) {
    const mainUrls = resolveLocalDesktopAppUrlsForVariant("main");
    await waitForVite(mainUrls.viteDevServerUrl);
    log(`vite_ready=yes port=${mainUrls.webPort}`);
    child.unref();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      convex.stopManagedProcess();
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`dev stack exited with code ${String(code)}`));
    });
  });
}

await main();
