#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Standalone headed verifier runs before an Effect platform context exists.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  agentChromeVerificationPassed,
  buildAgentChromeVerificationManifest,
  parseAgentChromeVerification,
} from "./lib/agent-chrome-browser-verifier.ts";
import { setupAgentChromeBrowser } from "./lib/agent-chrome-browser.ts";

const verificationPrompt = [
  "Use only the playwright-extension browser tools.",
  "Call browser_tabs to list the already-open shared Chrome pages.",
  "Call browser_resize with width 1440 and height 900.",
  "Do not navigate, click, type, or inspect page content.",
  "Return exactly SHARED_CHROME_E2E_OK tab_count=<number> viewport=1440x900 if both calls succeed.",
  "Otherwise return exactly SHARED_CHROME_E2E_FAILED.",
  "Do not include URLs, titles, tokens, account identities, or page contents.",
].join(" ");

function main(): void {
  const doctor = setupAgentChromeBrowser("doctor");
  if (!doctor.ready) {
    throw new Error("Agent Chrome doctor is not ready; run agent-browser:setup -- --write first.");
  }

  const temporaryDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "agent-chrome-e2e-"));
  const eventsPath = NodePath.join(temporaryDir, "events.jsonl");
  const finalPath = NodePath.join(temporaryDir, "final.txt");
  try {
    const result = NodeChildProcess.spawnSync(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "--json",
        "--output-last-message",
        finalPath,
        verificationPrompt,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 180_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    NodeFS.writeFileSync(eventsPath, result.stdout ?? "", { mode: 0o600 });
    if (result.status !== 0) {
      throw new Error("Codex failed during the shared Chrome headed verification.");
    }
    const finalMessage = NodeFS.readFileSync(finalPath, "utf8");
    const assertions = parseAgentChromeVerification(
      NodeFS.readFileSync(eventsPath, "utf8"),
      finalMessage,
    );
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
    NodeFS.writeFileSync(
      manifestPath,
      `${JSON.stringify(buildAgentChromeVerificationManifest(assertions), null, 2)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(`Agent Chrome headed verification passed.\nEvidence: ${manifestPath}\n`);
  } finally {
    NodeFS.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
