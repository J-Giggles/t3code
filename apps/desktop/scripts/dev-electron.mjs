import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  desktopDir,
  resolveDevProtocolClient,
  resolveElectronLaunchCommand,
} from "./electron-launcher.mjs";
import { cleanupDarwinDevProcesses } from "./dev-process-cleanup.mjs";
import { waitForResources } from "./wait-for-resources.mjs";

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
if (!devServerUrl) {
  throw new Error("VITE_DEV_SERVER_URL is required for desktop development.");
}

const devServer = new URL(devServerUrl);
const port = Number.parseInt(devServer.port, 10);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`VITE_DEV_SERVER_URL must include an explicit port: ${devServerUrl}`);
}

const requiredFiles = [
  "dist-electron/main.cjs",
  "dist-electron/preload.cjs",
  "../server/dist/bin.mjs",
];
const watchedDirectories = [
  { directory: "dist-electron", files: new Set(["main.cjs", "preload.cjs"]) },
  { directory: "../server/dist", files: new Set(["bin.mjs"]) },
];
const forcedShutdownTimeoutMs = 1_500;
const restartDebounceMs = 120;
const childTreeGracePeriodMs = 1_200;
const remoteDebuggingPortReleaseTimeoutMs = 5_000;
const restartControlToken =
  process.env.T3CODE_RESTART_CONTROL_TOKEN?.trim() || NodeCrypto.randomBytes(32).toString("hex");
const remoteDebuggingPort = process.env.T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT?.trim();
const parseDevChangePolicy = (value) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "manual" || normalized === "auto" ? normalized : undefined;
};
const parseBooleanEnvFlag = (value) =>
  ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
const resolveDevChangePolicy = (env, defaultPolicy = "auto") =>
  parseDevChangePolicy(env.T3CODE_DEV_CHANGE_POLICY) ??
  (parseBooleanEnvFlag(env.T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE) ? "manual" : defaultPolicy);
const disableRestartOnChange = resolveDevChangePolicy(process.env) === "manual";
const restartOnExit = parseBooleanEnvFlag(process.env.T3CODE_DESKTOP_RESTART_ON_EXIT);
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone dev script has no Effect runtime.
const hostPlatform = NodeOS.platform();

await waitForResources({
  baseDir: desktopDir,
  files: requiredFiles,
  tcpHost: devServer.hostname,
  tcpPort: port,
});

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const devProtocolClient = resolveDevProtocolClient();
if (devProtocolClient) {
  childEnv.T3CODE_DESKTOP_APP_USER_MODEL_ID = devProtocolClient.appBundleId;
  childEnv.T3CODE_DESKTOP_PROTOCOL_REGISTRATION_MANAGED = "1";
}

let shuttingDown = false;
let restartTimer = null;
let codeUpdateNotificationTimer = null;
let currentApp = null;
let restartQueue = Promise.resolve();
let restartControlServer = null;
const expectedExits = new WeakSet();
const watchers = [];

function killChildTreeByPid(pid, signal) {
  if (hostPlatform === "win32" || typeof pid !== "number") {
    return;
  }

  NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-P", String(pid)], { stdio: "ignore" });
}

function cleanupStaleDevApps(signal = "TERM") {
  if (hostPlatform === "win32") {
    return;
  }

  const devRootArg = `--t3code-dev-root=${desktopDir}`;
  const scopedEnvEntries = [
    childEnv.XDG_CONFIG_HOME ? `XDG_CONFIG_HOME=${childEnv.XDG_CONFIG_HOME}` : null,
    childEnv.T3CODE_HOME ? `T3CODE_HOME=${childEnv.T3CODE_HOME}` : null,
  ].filter(Boolean);

  if (hostPlatform === "linux" && scopedEnvEntries.length > 0) {
    for (const entry of NodeFS.readdirSync("/proc", { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
      const pid = Number.parseInt(entry.name, 10);
      if (pid === process.pid) continue;

      try {
        const cmdline = NodeFS.readFileSync(NodePath.join("/proc", entry.name, "cmdline"));
        if (!cmdline.includes(devRootArg)) continue;

        const environment = NodeFS.readFileSync(NodePath.join("/proc", entry.name, "environ"));
        if (!scopedEnvEntries.some((value) => environment.includes(value))) continue;

        process.kill(pid, `SIG${signal}`);
      } catch {
        // Processes can exit or deny access while procfs is being scanned.
      }
    }
    return;
  }

  if (hostPlatform === "darwin") {
    cleanupDarwinDevProcesses({ devRootArg, signal });
    return;
  }

  NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-f", "--", devRootArg], {
    stdio: "ignore",
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function canListenOnLoopback(port) {
  return new Promise((resolve) => {
    const server = NodeNet.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        request.destroy();
      }
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", () => {
      resolve("");
    });
  });
}

function writeJsonResponse(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function startRestartControlServer() {
  restartControlServer = NodeHttp.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/restart") {
      writeJsonResponse(response, 404, { error: "not_found" });
      return;
    }

    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${restartControlToken}`) {
      writeJsonResponse(response, 401, { error: "unauthorized" });
      return;
    }

    const rawBody = await readRequestBody(request);
    let mode = "full-setup";
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      if (parsed && typeof parsed === "object" && parsed.mode === "full-setup") {
        mode = parsed.mode;
      }
    } catch {
      // Invalid JSON still requests the only supported restart mode.
    }

    if (mode !== "full-setup") {
      writeJsonResponse(response, 400, { error: "unsupported_mode" });
      return;
    }

    writeJsonResponse(response, 202, { accepted: true });
    scheduleRestart();
  });

  await new Promise((resolve, reject) => {
    restartControlServer.once("error", reject);
    restartControlServer.listen(0, "127.0.0.1", () => {
      restartControlServer.off("error", reject);
      resolve();
    });
  });

  const address = restartControlServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve restart control server address.");
  }

  childEnv.T3CODE_RESTART_CONTROL_URL = `http://127.0.0.1:${address.port}`;
  childEnv.T3CODE_RESTART_CONTROL_TOKEN = restartControlToken;
  childEnv.T3CODE_RESTART_CONTROL_KIND = "desktop-dev-supervisor";
}

async function stopRestartControlServer() {
  const server = restartControlServer;
  if (!server) {
    return;
  }
  restartControlServer = null;
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function waitForRemoteDebuggingPortRelease() {
  if (!remoteDebuggingPort) {
    return;
  }

  const port = Number.parseInt(remoteDebuggingPort, 10);
  if (!Number.isInteger(port) || port <= 0) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < remoteDebuggingPortReleaseTimeoutMs) {
    if (await canListenOnLoopback(port)) {
      return;
    }

    cleanupStaleDevApps();
    await delay(100);
  }

  console.warn(
    `[desktop-dev] Remote debugging port ${port} is still in use; restarting Electron anyway.`,
  );
}

function startApp() {
  if (shuttingDown || currentApp !== null) {
    return;
  }

  const electronArgs = remoteDebuggingPort
    ? [`--remote-debugging-port=${remoteDebuggingPort}`]
    : [];
  const devRootArg = `--t3code-dev-root=${desktopDir}`;
  const launchArgs = devProtocolClient
    ? [...electronArgs, devRootArg]
    : [...electronArgs, devRootArg, "dist-electron/main.cjs"];
  const electronCommand = resolveElectronLaunchCommand(launchArgs);
  const app = NodeChildProcess.spawn(electronCommand.electronPath, electronCommand.args, {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  });

  currentApp = app;

  app.once("error", () => {
    if (currentApp === app) {
      currentApp = null;
    }

    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  app.once("exit", (code, signal) => {
    if (currentApp === app) {
      currentApp = null;
    }

    const exitedAbnormally = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(app) && (restartOnExit || exitedAbnormally)) {
      scheduleRestart();
    }
  });
}

async function stopApp() {
  const app = currentApp;
  if (!app) {
    return;
  }

  currentApp = null;
  expectedExits.add(app);

  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    app.once("exit", finish);
    if (hostPlatform === "darwin") {
      // LaunchServices owns the Electron process. Keep `open -W` alive until the
      // real app exits so it remains a truthful supervisor instead of detaching
      // an orphaned Electron process.
      cleanupStaleDevApps();
    } else {
      app.kill("SIGTERM");
      killChildTreeByPid(app.pid, "TERM");
      cleanupStaleDevApps();
    }

    setTimeout(() => {
      if (settled) {
        return;
      }

      app.kill("SIGKILL");
      killChildTreeByPid(app.pid, "KILL");
      cleanupStaleDevApps("KILL");
      finish();
    }, forcedShutdownTimeoutMs);
  });
}

function scheduleRestart() {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp();
        cleanupStaleDevApps();
        await waitForRemoteDebuggingPortRelease();
        if (!shuttingDown) {
          startApp();
        }
      });
  }, restartDebounceMs);
}

function notifyRunningCodeChanged() {
  if (shuttingDown || currentApp === null) {
    return;
  }

  if (hostPlatform === "darwin") {
    NodeChildProcess.spawnSync("pkill", ["-USR2", "-f", "--", `--t3code-dev-root=${desktopDir}`], {
      stdio: "ignore",
    });
    return;
  }

  currentApp.kill("SIGUSR2");
}

function scheduleRunningCodeChangedNotification() {
  if (shuttingDown) {
    return;
  }

  if (codeUpdateNotificationTimer) {
    clearTimeout(codeUpdateNotificationTimer);
  }

  codeUpdateNotificationTimer = setTimeout(() => {
    codeUpdateNotificationTimer = null;
    notifyRunningCodeChanged();
  }, restartDebounceMs);
}

function startWatchers() {
  for (const { directory, files } of watchedDirectories) {
    const watcher = NodeFS.watch(
      NodePath.join(desktopDir, directory),
      { persistent: true },
      (_eventType, filename) => {
        if (typeof filename !== "string" || !files.has(filename)) {
          return;
        }

        if (disableRestartOnChange) {
          scheduleRunningCodeChangedNotification();
        } else {
          scheduleRestart();
        }
      },
    );

    watchers.push(watcher);
  }
}

function killChildTree(signal) {
  if (hostPlatform === "win32") {
    return;
  }

  // Kill direct children as a final fallback in case normal shutdown leaves stragglers.
  NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-P", String(process.pid)], {
    stdio: "ignore",
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (codeUpdateNotificationTimer) {
    clearTimeout(codeUpdateNotificationTimer);
    codeUpdateNotificationTimer = null;
  }

  for (const watcher of watchers) {
    watcher.close();
  }

  await stopRestartControlServer();
  await stopApp();
  killChildTree("TERM");
  await new Promise((resolve) => {
    setTimeout(resolve, childTreeGracePeriodMs);
  });
  killChildTree("KILL");

  process.exit(exitCode);
}

await startRestartControlServer();
startWatchers();
cleanupStaleDevApps();
startApp();

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});
process.once("SIGHUP", () => {
  void shutdown(129);
});
