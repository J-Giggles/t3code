#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off - Standalone headed verifier runs before an Effect platform context exists.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  agentChromeVerificationPassed,
  SharedChromePageObject,
} from "./lib/agent-chrome-browser-verifier.ts";
import {
  buildAgentChromeDesktopDefinition,
  setupAgentChromeBrowser,
} from "./lib/agent-chrome-browser.ts";

interface SessionSentinel {
  readonly server: NodeHttp.Server;
  readonly seedUrl: string;
  readonly checkUrl: string;
  readonly seeded: Promise<void>;
}

function startSessionSentinel(): Promise<SessionSentinel> {
  return new Promise((resolve, reject) => {
    let resolveSeeded: (() => void) | undefined;
    const seeded = new Promise<void>((seedResolve) => {
      resolveSeeded = seedResolve;
    });
    const cookieName = "t3code_agent_browser_session";
    const cookieValue = "shared";
    const server = NodeHttp.createServer((request, response) => {
      if (request.url === "/seed") {
        response.setHeader(
          "Set-Cookie",
          `${cookieName}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300`,
        );
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end("<!doctype html><title>Session seeded</title><script>window.close()</script>");
        resolveSeeded?.();
        return;
      }
      if (request.url === "/check") {
        const authenticated = request.headers.cookie
          ?.split(";")
          .map((part) => part.trim())
          .includes(`${cookieName}=${cookieValue}`);
        response.statusCode = authenticated ? 200 : 401;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(authenticated ? "SHARED_SESSION_AUTHENTICATED" : "SESSION_MISSING");
        return;
      }
      response.statusCode = 404;
      response.end("Not found");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate the local shared-session sentinel."));
        return;
      }
      const origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, seedUrl: `${origin}/seed`, checkUrl: `${origin}/check`, seeded });
    });
  });
}

function waitWithTimeout(
  promise: Promise<void>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function runCodex(prompt: string, cwd: string, finalPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "--json",
        "--output-last-message",
        finalPath,
        prompt,
      ],
      { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdout: Array<Buffer> = [];
    const stderr: Array<Buffer> = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const timeout = setTimeout(() => child.kill("SIGTERM"), 180_000);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `Codex failed during headed Chrome verification (${signal ?? `exit ${code ?? "unknown"}`}; stderr bytes ${Buffer.concat(stderr).byteLength}).`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

async function main(): Promise<void> {
  const doctor = setupAgentChromeBrowser("doctor");
  if (!doctor.ready) {
    throw new Error("Agent Chrome doctor is not ready; run agent-browser:setup -- --write first.");
  }

  const temporaryDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "agent-chrome-e2e-"));
  const finalPath = NodePath.join(temporaryDir, "final.txt");
  const sentinel = await startSessionSentinel();
  try {
    const desktop = buildAgentChromeDesktopDefinition(NodeOS.homedir());
    const chrome = NodeChildProcess.spawn(desktop.launcherPath, [sentinel.seedUrl], {
      detached: true,
      env: process.env,
      stdio: "ignore",
    });
    chrome.unref();
    await waitWithTimeout(
      sentinel.seeded,
      30_000,
      "Pinned Chrome did not seed the shared session cookie within 30 seconds.",
    );

    const page = new SharedChromePageObject(sentinel.checkUrl);
    const eventsJsonl = await runCodex(page.verificationPrompt(), process.cwd(), finalPath);
    const finalMessage = NodeFS.readFileSync(finalPath, "utf8");
    const assertions = page.assertions(eventsJsonl, finalMessage);
    if (!agentChromeVerificationPassed(assertions)) {
      throw new Error("Shared Chrome headed verification assertions failed.");
    }

    const evidenceDir = NodePath.join(
      doctor.outputDir,
      "verification",
      new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"),
    );
    NodeFS.mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    const manifestPath = NodePath.join(evidenceDir, "manifest.json");
    NodeFS.writeFileSync(manifestPath, `${JSON.stringify(page.manifest(assertions), null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write(`Agent Chrome headed verification passed.\nEvidence: ${manifestPath}\n`);
  } finally {
    sentinel.server.close();
    NodeFS.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
