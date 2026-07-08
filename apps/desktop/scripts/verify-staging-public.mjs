import * as NodeChildProcess from "node:child_process";
import * as NodeDnsPromises from "node:dns/promises";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

import { chromium } from "playwright";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const desktopDir = NodePath.resolve(__dirname, "..");
const repoRoot = NodePath.resolve(desktopDir, "../..");

const PUBLIC_VERIFY_TARGET = process.env.T3CODE_PUBLIC_VERIFY_TARGET?.trim() || "staging";
const DEFAULT_PUBLIC_URL =
  PUBLIC_VERIFY_TARGET === "nightly"
    ? "https://giggabit-server.tailfb378a.ts.net/nightly/"
    : "https://giggabit-server.tailfb378a.ts.net/staging/";
const DEFAULT_MESSAGE = "Hi";
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_PAIRING_BASE_DIR =
  PUBLIC_VERIFY_TARGET === "nightly"
    ? "~/.local/share/t3code-dev/nightly"
    : "~/.local/share/t3code-dev/staging";
const DEFAULT_PAIRING_DEV_URL =
  PUBLIC_VERIFY_TARGET === "nightly"
    ? "http://127.0.0.1:5833/nightly/"
    : "http://127.0.0.1:5793/staging/";
const DEFAULT_PROJECT_ROOT = PUBLIC_VERIFY_TARGET === "nightly" ? repoRoot : "";
const DEFAULT_PROJECT_TITLE = PUBLIC_VERIFY_TARGET === "nightly" ? "nightly-local" : "";
const DEFAULT_PAIRING_TTL = "5m";
const DEFAULT_NETWORK_PREFLIGHT_TIMEOUT_MS = 20_000;

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

function readBooleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function readFallbackEnv(primaryName, fallbackName, fallback) {
  return process.env[primaryName] ?? process.env[fallbackName] ?? fallback;
}

function readBooleanFallbackEnv(primaryName, fallbackName, fallback) {
  if (process.env[primaryName] !== undefined) return readBooleanEnv(primaryName, fallback);
  return readBooleanEnv(fallbackName, fallback);
}

function readTimeoutMs() {
  const raw = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_TIMEOUT_MS",
    "T3CODE_STAGING_VERIFY_TIMEOUT_MS",
    undefined,
  );
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function resolveHeadless() {
  if (process.env.T3CODE_PUBLIC_VERIFY_HEADLESS !== undefined) {
    return readBooleanEnv("T3CODE_PUBLIC_VERIFY_HEADLESS", false);
  }
  if (process.env.T3CODE_STAGING_VERIFY_HEADLESS !== undefined) {
    return readBooleanEnv("T3CODE_STAGING_VERIFY_HEADLESS", false);
  }
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

function sanitizeFilenameSegment(value) {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") || "staging-public";
}

function expandHome(input) {
  if (input === "~") return NodeOS.homedir();
  if (input.startsWith("~/")) return NodePath.join(NodeOS.homedir(), input.slice(2));
  return input;
}

function hasPairingToken(url) {
  return url.searchParams.has("token") || /(?:^|[&#])token=/u.test(url.hash);
}

function buildPairingUrl(publicUrl, token) {
  const url = new URL(publicUrl);
  const pathname = url.pathname.replace(/\/+$/u, "");
  url.pathname = pathname.endsWith("/pair") ? pathname : `${pathname}/pair`;
  url.search = "";
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

function buildAuthSessionUrl(publicUrl) {
  const url = new URL(publicUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${basePath}/api/auth/session`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseDefaultInterfaceFromRoutes(stdout) {
  const ignoredInterfacePattern = /^(tailscale|docker|br-|nord|wg)/u;
  for (const line of stdout.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields[0] !== "default") continue;
    const devIndex = fields.indexOf("dev");
    const candidate = devIndex >= 0 ? fields[devIndex + 1] : undefined;
    if (candidate && !ignoredInterfacePattern.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveDefaultInterface() {
  const { stdout } = await execFile("ip", ["-4", "route", "show", "default", "table", "main"], {
    timeout: 5_000,
  });
  const networkInterface = parseDefaultInterfaceFromRoutes(stdout);
  if (!networkInterface) {
    throw new Error("Could not determine the primary IPv4 network interface.");
  }
  return networkInterface;
}

async function resolvePublicIpv4Address(hostname) {
  const result = await NodeDnsPromises.lookup(hostname, { family: 4 });
  return result.address;
}

async function writeNetworkPreflightArtifact(input) {
  await NodeFSP.mkdir(input.artifactDir, { recursive: true });
  await NodeFSP.writeFile(
    NodePath.join(input.artifactDir, "network-preflight.json"),
    `${JSON.stringify(input.details, null, 2)}\n`,
  );
}

async function verifyPrimaryInterfaceReachability(publicUrl, artifactDir) {
  if (
    readBooleanFallbackEnv(
      "T3CODE_PUBLIC_VERIFY_SKIP_INTERFACE_PREFLIGHT",
      "T3CODE_STAGING_VERIFY_SKIP_INTERFACE_PREFLIGHT",
      false,
    )
  ) {
    return { checked: false, reason: "disabled by public verifier environment" };
  }

  const url = new URL(publicUrl);
  const targetUrl = buildAuthSessionUrl(publicUrl);
  const hostname = url.hostname;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const [networkInterface, ipv4Address] = await Promise.all([
    resolveDefaultInterface(),
    resolvePublicIpv4Address(hostname),
  ]);
  const args = [
    "--interface",
    networkInterface,
    "--resolve",
    `${hostname}:${port}:${ipv4Address}`,
    "--connect-timeout",
    "8",
    "--max-time",
    String(Math.ceil(DEFAULT_NETWORK_PREFLIGHT_TIMEOUT_MS / 1_000)),
    "--silent",
    "--show-error",
    "--fail",
    "--output",
    "/dev/null",
    "--write-out",
    "%{http_code}",
    targetUrl,
  ];

  try {
    const { stdout, stderr } = await execFile("curl", args, {
      timeout: DEFAULT_NETWORK_PREFLIGHT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const details = {
      checked: true,
      ok: true,
      command: "curl",
      args,
      hostname,
      ipv4Address,
      networkInterface,
      targetUrl,
      statusCode: stdout.trim(),
      stderr,
    };
    await writeNetworkPreflightArtifact({ artifactDir, details });
    return details;
  } catch (cause) {
    const details = {
      checked: true,
      ok: false,
      command: "curl",
      args,
      hostname,
      ipv4Address,
      networkInterface,
      targetUrl,
      exitCode: cause && typeof cause === "object" && "code" in cause ? cause.code : undefined,
      stdout:
        cause && typeof cause === "object" && "stdout" in cause
          ? String(cause.stdout).slice(0, 5_000)
          : "",
      stderr:
        cause && typeof cause === "object" && "stderr" in cause
          ? String(cause.stderr).slice(0, 5_000)
          : String(cause).slice(0, 5_000),
    };
    await writeNetworkPreflightArtifact({ artifactDir, details });
    throw new Error(
      `Primary interface preflight failed for ${targetUrl} via ${networkInterface} (${ipv4Address}).\nArtifacts: ${artifactDir}`,
      { cause },
    );
  }
}

function readPairingBaseDir() {
  return expandHome(
    readFallbackEnv(
      "T3CODE_PUBLIC_VERIFY_PAIRING_BASE_DIR",
      "T3CODE_STAGING_VERIFY_PAIRING_BASE_DIR",
      DEFAULT_PAIRING_BASE_DIR,
    ),
  );
}

function readPairingDevUrl() {
  return readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_PAIRING_DEV_URL",
    "T3CODE_STAGING_VERIFY_PAIRING_DEV_URL",
    DEFAULT_PAIRING_DEV_URL,
  );
}

function readProjectSeedConfig() {
  const enabled = readBooleanFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_SEED_PROJECT",
    "T3CODE_STAGING_VERIFY_SEED_PROJECT",
    PUBLIC_VERIFY_TARGET === "nightly",
  );
  const workspaceRoot = expandHome(
    readFallbackEnv(
      "T3CODE_PUBLIC_VERIFY_PROJECT_ROOT",
      "T3CODE_STAGING_VERIFY_PROJECT_ROOT",
      DEFAULT_PROJECT_ROOT,
    ),
  ).trim();
  const title = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_PROJECT_TITLE",
    "T3CODE_STAGING_VERIFY_PROJECT_TITLE",
    DEFAULT_PROJECT_TITLE,
  ).trim();
  return { enabled, workspaceRoot, title };
}

function isProjectAlreadyExistsError(error) {
  const output = [
    error && typeof error === "object" && "stdout" in error ? error.stdout : "",
    error && typeof error === "object" && "stderr" in error ? error.stderr : "",
    error instanceof Error ? error.message : String(error),
  ].join("\n");
  return (
    output.includes("ProjectAlreadyExistsError") ||
    output.includes("An active project already exists")
  );
}

async function ensureVerificationProject() {
  const config = readProjectSeedConfig();
  if (!config.enabled || !config.workspaceRoot) {
    return { enabled: false };
  }

  const binPath = NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs");
  const args = [
    binPath,
    "project",
    "add",
    config.workspaceRoot,
    "--base-dir",
    readPairingBaseDir(),
  ];
  if (config.title) {
    args.push("--title", config.title);
  }

  try {
    await execFile(process.execPath, args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    return { enabled: true, action: "created", workspaceRoot: config.workspaceRoot };
  } catch (error) {
    if (isProjectAlreadyExistsError(error)) {
      return { enabled: true, action: "already-exists", workspaceRoot: config.workspaceRoot };
    }
    throw new Error(`Failed to seed verifier project '${config.workspaceRoot}'.`, { cause: error });
  }
}

async function issuePairingToken() {
  const baseDir = readPairingBaseDir();
  const devUrl = readPairingDevUrl();
  const ttl = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_PAIRING_TTL",
    "T3CODE_STAGING_VERIFY_PAIRING_TTL",
    DEFAULT_PAIRING_TTL,
  );
  const binPath = NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs");
  const { stdout } = await execFile(
    process.execPath,
    [
      binPath,
      "auth",
      "pairing",
      "create",
      "--base-dir",
      baseDir,
      "--dev-url",
      devUrl,
      "--ttl",
      ttl,
      "--json",
    ],
    {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    },
  );
  const parsed = JSON.parse(stdout);
  if (typeof parsed.credential !== "string" || parsed.credential.length === 0) {
    throw new Error("Pairing token command did not return a credential.");
  }
  return parsed.credential;
}

async function resolveStartUrl(publicUrl) {
  const parsed = new URL(publicUrl);
  if (hasPairingToken(parsed)) {
    return publicUrl;
  }

  const explicitToken = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_PAIRING_TOKEN",
    "T3CODE_STAGING_VERIFY_PAIRING_TOKEN",
    "",
  ).trim();
  if (explicitToken) {
    return buildPairingUrl(publicUrl, explicitToken);
  }

  if (
    readBooleanFallbackEnv(
      "T3CODE_PUBLIC_VERIFY_SKIP_PAIRING",
      "T3CODE_STAGING_VERIFY_SKIP_PAIRING",
      false,
    )
  ) {
    return publicUrl;
  }

  return buildPairingUrl(publicUrl, await issuePairingToken());
}

async function writeFailureArtifact(input) {
  const bodyText = await input.page
    .locator("body")
    .innerText({ timeout: 1_000 })
    .catch(() => "");
  const cookies = await input.page
    .context()
    .cookies()
    .catch(() => []);
  const storage = await input.page
    .evaluate(() => {
      const localStorageEntries = {};
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key) {
          localStorageEntries[key] = window.localStorage.getItem(key);
        }
      }
      return {
        localStorage: localStorageEntries,
      };
    })
    .catch(() => null);
  const debug = {
    failedAt: new Date().toISOString(),
    step: input.step,
    configuredUrl: input.publicUrl,
    startUrl: input.startUrl,
    currentUrl: input.page.url(),
    title: await input.page.title().catch(() => ""),
    bodyText: bodyText.slice(0, 5_000),
    cookies,
    storage,
    consoleErrors: input.consoleErrors.slice(-25),
    pageErrors: input.pageErrors.slice(-10),
    responses: input.responses.slice(-50),
    requestFailures: input.requestFailures.slice(-25),
    webSockets: input.webSockets.slice(-10),
  };
  await NodeFSP.mkdir(input.artifactDir, { recursive: true });
  await input.page
    .screenshot({ path: NodePath.join(input.artifactDir, "failure.png"), fullPage: true })
    .catch(() => undefined);
  await NodeFSP.writeFile(
    NodePath.join(input.artifactDir, "failure.json"),
    `${JSON.stringify(debug, null, 2)}\n`,
  );
}

async function fail(input, message) {
  await writeFailureArtifact(input);
  throw new Error(`${message}\nArtifacts: ${input.artifactDir}`);
}

async function waitForAssistantResponse(page, timeoutMs) {
  return await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('[data-message-role="assistant"]'));
      for (const row of rows) {
        const text = (row.textContent ?? "").replace(/\s+/gu, " ").trim();
        if (text.length > 0) {
          return text;
        }
      }
      return false;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function main() {
  const publicUrl = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_URL",
    "T3CODE_STAGING_PUBLIC_URL",
    DEFAULT_PUBLIC_URL,
  );
  const projectSeed = await ensureVerificationProject();
  const startUrl = await resolveStartUrl(publicUrl);
  const message = readFallbackEnv(
    "T3CODE_PUBLIC_VERIFY_MESSAGE",
    "T3CODE_STAGING_VERIFY_MESSAGE",
    DEFAULT_MESSAGE,
  );
  const timeoutMs = readTimeoutMs();
  const artifactRoot =
    readFallbackEnv(
      "T3CODE_PUBLIC_VERIFY_ARTIFACT_DIR",
      "T3CODE_STAGING_VERIFY_ARTIFACT_DIR",
      undefined,
    ) ?? NodePath.join(desktopDir, "test-results", `${PUBLIC_VERIFY_TARGET}-public`);
  const artifactDir = NodePath.join(
    artifactRoot,
    `${new Date().toISOString().replace(/[:.]/gu, "-")}-${sanitizeFilenameSegment(new URL(publicUrl).hostname)}`,
  );
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const responses = [];
  const webSockets = [];

  await NodeFSP.mkdir(artifactDir, { recursive: true });
  const networkPreflight = await verifyPrimaryInterfaceReachability(publicUrl, artifactDir);

  const browser = await chromium.launch({ headless: resolveHeadless() });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const failureContext = {
    artifactDir,
    consoleErrors,
    page,
    pageErrors,
    publicUrl,
    requestFailures,
    responses,
    startUrl,
    step: "startup",
    webSockets,
  };

  page.on("console", (messageEntry) => {
    if (messageEntry.type() !== "error") return;
    consoleErrors.push(messageEntry.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack || error.message);
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() < 400 && !/\/(?:api|ws)\b|\.well-known\/t3\/environment/u.test(url)) {
      return;
    }
    responses.push({
      status: response.status(),
      url,
    });
  });
  page.on("websocket", (socket) => {
    const entry = {
      url: socket.url(),
      framesSent: [],
      framesReceived: [],
      closed: false,
      socketErrors: [],
    };
    webSockets.push(entry);
    socket.on("framesent", (event) => {
      if (entry.framesSent.length < 20) {
        entry.framesSent.push(String(event.payload).slice(0, 1_000));
      }
    });
    socket.on("framereceived", (event) => {
      if (entry.framesReceived.length < 20) {
        entry.framesReceived.push(String(event.payload).slice(0, 1_000));
      }
    });
    socket.on("close", () => {
      entry.closed = true;
    });
    socket.on("socketerror", (error) => {
      entry.socketErrors.push(String(error));
    });
  });

  try {
    failureContext.step = "navigate";
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (page.url().startsWith("chrome-error://")) {
      await fail(
        failureContext,
        `Public ${PUBLIC_VERIFY_TARGET} URL opened a browser error page: ${publicUrl}`,
      );
    }

    failureContext.step = "app-shell";
    await page.waitForSelector("body", { state: "attached", timeout: 60_000 });
    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        const bodyText = document.body.innerText.trim();
        return Boolean(root && bodyText.length > 0);
      },
      undefined,
      { timeout: 60_000 },
    );

    failureContext.step = "project-list";
    const newThreadButtons = page.locator('[data-testid="new-thread-button"]');
    await newThreadButtons.first().waitFor({ state: "attached", timeout: 90_000 });
    const projectCount = await newThreadButtons.count();
    if (projectCount < 1) {
      await fail(
        failureContext,
        `No projects were available in the public ${PUBLIC_VERIFY_TARGET} browser.`,
      );
    }

    const firstProjectButton = newThreadButtons.first();
    const projectTitle = await firstProjectButton.evaluate((button) => {
      const label = button.getAttribute("aria-label") ?? "";
      const prefix = "Create new thread in ";
      return label.startsWith(prefix) ? label.slice(prefix.length).trim() : "";
    });
    if (!projectTitle) {
      await fail(failureContext, "The project row did not expose a create-thread label.");
    }

    const projectTitleLocator = page.getByText(projectTitle, { exact: true }).first();
    await projectTitleLocator.waitFor({ state: "visible", timeout: 30_000 });

    failureContext.step = "create-chat";
    await projectTitleLocator.hover();
    await Promise.all([
      page.waitForURL((url) => /(?:#\/|\/)draft\/[^/?#]+/u.test(url.href), {
        timeout: 60_000,
      }),
      firstProjectButton.click({ force: true }),
    ]);

    failureContext.step = "send-message";
    const composer = page.getByTestId("composer-editor");
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.click();
    await page.keyboard.type(message);
    const sendButton = page.getByRole("button", { name: "Send message" });
    await sendButton.waitFor({ state: "visible", timeout: 30_000 });
    if (!(await sendButton.isEnabled())) {
      await fail(failureContext, "The chat composer did not enable the Send message button.");
    }
    await sendButton.click();

    failureContext.step = "assistant-response";
    await page
      .getByRole("button", { name: /Stop generation|Stop/u })
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => undefined);
    const assistantHandle = await waitForAssistantResponse(page, timeoutMs);
    const assistantText = await assistantHandle.jsonValue();
    await page.getByRole("button", { name: "Send message" }).waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
    await page.screenshot({ path: NodePath.join(artifactDir, "pass.png"), fullPage: true });

    console.log(
      JSON.stringify(
        {
          ok: true,
          url: page.url(),
          projectTitle,
          assistantText: String(assistantText).slice(0, 500),
          projectSeed,
          networkPreflight,
          artifactDir,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Artifacts:")) {
      await writeFailureArtifact(failureContext).catch(() => undefined);
      throw new Error(`${message}\nArtifacts: ${artifactDir}`, { cause: error });
    }
    throw error;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

await main();
