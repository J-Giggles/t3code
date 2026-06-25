import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export const RUNTIME_RESTART_REQUIRED_PATH = "/.well-known/t3/runtime/restart-required";
export const DEFAULT_SERVER_PORT = 3773;

const scriptPath = NodeURL.fileURLToPath(import.meta.url);
const serverDir = NodePath.resolve(NodePath.dirname(scriptPath), "..");
const repoRoot = NodePath.resolve(serverDir, "../..");
const restartDebounceMs = 120;
const childStopTimeoutMs = 1_500;
const childTreeGracePeriodMs = 300;
const restartControlToken =
  process.env.T3CODE_RESTART_CONTROL_TOKEN?.trim() || NodeCrypto.randomBytes(32).toString("hex");
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone dev script has no Effect runtime.
const hostPlatform = NodeOS.platform();
const restartReason = "T3 Code server source changed.";

let shuttingDown = false;
let restartTimer = null;
let notificationTimer = null;
let currentServer = null;
let restartQueue = Promise.resolve();
let restartControlServer = null;
const expectedExits = new WeakSet();
const watchers = [];

export function parseBooleanEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function parseDevChangePolicy(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "manual" || normalized === "auto" ? normalized : undefined;
}

export function resolveDevChangePolicy(env, defaultPolicy = "auto") {
  return (
    parseDevChangePolicy(env.T3CODE_DEV_CHANGE_POLICY) ??
    (parseBooleanEnvFlag(env.T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE) ? "manual" : defaultPolicy)
  );
}

export function bearerTokenFromAuthorization(authorization) {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return null;
  }

  const token = authorization.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

export function isAuthorizedRestartRequest(authorization, token) {
  const presentedToken = bearerTokenFromAuthorization(authorization);
  if (!presentedToken || !token) {
    return false;
  }

  const leftBuffer = Buffer.from(presentedToken);
  const rightBuffer = Buffer.from(token);
  return (
    leftBuffer.length === rightBuffer.length && NodeCrypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function parseRestartRequestMode(rawBody) {
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    if (parsed && typeof parsed === "object" && typeof parsed.mode === "string") {
      return parsed.mode;
    }
  } catch {
    return "full-setup";
  }

  return "full-setup";
}

export function parseRestartRequestReason(rawBody) {
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    if (parsed && typeof parsed === "object" && typeof parsed.reason === "string") {
      const reason = parsed.reason.trim();
      return reason.length > 0 ? reason : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function resolveBackendHttpBaseUrl(env, defaultPort = DEFAULT_SERVER_PORT) {
  const configuredUrl = env.VITE_HTTP_URL?.trim();
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      url.pathname = "/";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  const configuredPort = Number.parseInt(env.T3CODE_PORT ?? "", 10);
  const port =
    Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : defaultPort;
  return `http://127.0.0.1:${port}/`;
}

export function resolveRuntimeRestartRequiredUrl(baseUrl) {
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(RUNTIME_RESTART_REQUIRED_PATH, baseUrl).toString();
  } catch {
    return null;
  }
}

export function shouldWatchPath(path) {
  const normalized = path.split(NodePath.sep).join("/");
  if (
    normalized.includes("/node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/dist-electron/") ||
    normalized.includes("/.git/") ||
    normalized.includes("/.turbo/") ||
    normalized.includes("/.vite-plus/")
  ) {
    return false;
  }

  if (NodePath.basename(path).startsWith(".")) {
    return false;
  }

  return new Set([".cjs", ".js", ".json", ".jsonc", ".mjs", ".ts", ".tsx"]).has(
    NodePath.extname(path),
  );
}

export function resolveWatchRoots({ root = repoRoot, serverRoot = serverDir } = {}) {
  return [
    NodePath.join(serverRoot, "src"),
    NodePath.join(root, "packages/contracts/src"),
    NodePath.join(root, "packages/shared/src"),
    NodePath.join(root, "packages/effect-acp/src"),
    NodePath.join(root, "packages/effect-codex-app-server/src"),
    NodePath.join(root, "packages/ssh/src"),
    NodePath.join(root, "packages/tailscale/src"),
  ].filter((path) => NodeFS.existsSync(path));
}

function shouldDescendIntoDirectory(path) {
  const name = NodePath.basename(path);
  return (
    !name.startsWith(".") && name !== "node_modules" && name !== "dist" && name !== "dist-electron"
  );
}

function collectWatchDirectories(roots) {
  const directories = [];
  const seen = new Set();
  const visit = (directory) => {
    const resolvedDirectory = NodePath.resolve(directory);
    if (seen.has(resolvedDirectory) || !NodeFS.existsSync(resolvedDirectory)) {
      return;
    }

    seen.add(resolvedDirectory);
    directories.push(resolvedDirectory);

    for (const entry of NodeFS.readdirSync(resolvedDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const child = NodePath.join(resolvedDirectory, entry.name);
      if (shouldDescendIntoDirectory(child)) {
        visit(child);
      }
    }
  };

  for (const root of roots) {
    visit(root);
  }

  return directories;
}

async function readRequestBody(request) {
  return await new Promise((resolveBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        request.destroy();
      }
    });
    request.on("end", () => {
      resolveBody(body);
    });
    request.on("error", () => {
      resolveBody("");
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

export async function startRestartControlServer({ token, onRestart }) {
  const server = NodeHttp.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/restart") {
      writeJsonResponse(response, 404, { error: "not_found" });
      return;
    }

    if (!isAuthorizedRestartRequest(request.headers.authorization, token)) {
      writeJsonResponse(response, 401, { error: "unauthorized" });
      return;
    }

    const rawBody = await readRequestBody(request);
    const mode = parseRestartRequestMode(rawBody);
    if (mode !== "full-setup") {
      writeJsonResponse(response, 400, { error: "unsupported_mode" });
      return;
    }

    writeJsonResponse(response, 202, { accepted: true });
    onRestart({ reason: parseRestartRequestReason(rawBody) ?? "user-requested" });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve restart control server address.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolveClose) => {
        server.close(() => {
          resolveClose();
        });
      }),
  };
}

async function startControlServer() {
  restartControlServer = await startRestartControlServer({
    token: restartControlToken,
    onRestart: () => {
      scheduleRestart();
    },
  });
}

async function stopRestartControlServer() {
  const controlServer = restartControlServer;
  if (!controlServer) {
    return;
  }

  restartControlServer = null;
  await controlServer.close();
}

function killChildTreeByPid(pid, signal) {
  if (hostPlatform === "win32" || typeof pid !== "number") {
    return;
  }

  NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-P", String(pid)], { stdio: "ignore" });
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function startServer() {
  if (shuttingDown || currentServer !== null || restartControlServer === null) {
    return;
  }

  const childEnv = {
    ...process.env,
    T3CODE_RESTART_CONTROL_URL: restartControlServer.url,
    T3CODE_RESTART_CONTROL_TOKEN: restartControlToken,
    T3CODE_RESTART_CONTROL_KIND: "standalone-supervisor",
  };
  const child = NodeChildProcess.spawn(process.execPath, ["src/bin.ts"], {
    cwd: serverDir,
    env: childEnv,
    stdio: "inherit",
  });

  currentServer = child;

  child.once("error", () => {
    if (currentServer === child) {
      currentServer = null;
    }

    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  child.once("exit", (code, signal) => {
    if (currentServer === child) {
      currentServer = null;
    }

    const exitedAbnormally = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(child) && exitedAbnormally) {
      scheduleRestart();
    }
  });
}

async function stopServer() {
  const child = currentServer;
  if (!child) {
    return;
  }

  currentServer = null;
  expectedExits.add(child);

  await new Promise((resolveStop) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolveStop();
    };

    child.once("exit", finish);
    child.kill("SIGTERM");
    killChildTreeByPid(child.pid, "TERM");

    setTimeout(() => {
      if (settled) {
        return;
      }

      child.kill("SIGKILL");
      killChildTreeByPid(child.pid, "KILL");
      finish();
    }, childStopTimeoutMs).unref();
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
        await stopServer();
        if (!shuttingDown) {
          startServer();
        }
      });
  }, restartDebounceMs);
}

async function notifyRuntimeRestartRequired() {
  const endpoint = resolveRuntimeRestartRequiredUrl(resolveBackendHttpBaseUrl(process.env));
  if (!endpoint) {
    console.warn("[server-dev] Restart-required notification skipped: invalid backend URL.");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restartControlToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: restartReason }),
    });

    if (!response.ok) {
      console.warn(
        `[server-dev] Restart-required notification failed with status ${response.status}.`,
      );
    }
  } catch (error) {
    console.warn(
      `[server-dev] Restart-required notification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function scheduleRuntimeRestartRequiredNotification() {
  if (shuttingDown) {
    return;
  }

  if (notificationTimer) {
    clearTimeout(notificationTimer);
  }

  notificationTimer = setTimeout(() => {
    notificationTimer = null;
    void notifyRuntimeRestartRequired();
  }, restartDebounceMs);
}

function startWatchers() {
  const policy = resolveDevChangePolicy(process.env);
  for (const directory of collectWatchDirectories(resolveWatchRoots())) {
    const watcher = NodeFS.watch(directory, { persistent: true }, (_eventType, filename) => {
      if (typeof filename !== "string") {
        return;
      }

      const changedPath = NodePath.join(directory, filename);
      if (!shouldWatchPath(changedPath)) {
        return;
      }

      if (policy === "manual") {
        scheduleRuntimeRestartRequiredNotification();
      } else {
        scheduleRestart();
      }
    });

    watchers.push(watcher);
  }
}

function killChildTree(signal) {
  if (hostPlatform === "win32") {
    return;
  }

  NodeChildProcess.spawnSync("pkill", [`-${signal}`, "-P", String(process.pid)], {
    stdio: "ignore",
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }

  for (const watcher of watchers) {
    watcher.close();
  }

  await stopServer();
  await stopRestartControlServer();
  killChildTree("TERM");
  await delay(childTreeGracePeriodMs);
  killChildTree("KILL");

  process.exit(exitCode);
}

async function main() {
  await startControlServer();
  startWatchers();
  startServer();
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  await main();

  process.once("SIGINT", () => {
    void shutdown(130);
  });
  process.once("SIGTERM", () => {
    void shutdown(143);
  });
  process.once("SIGHUP", () => {
    void shutdown(129);
  });
}
