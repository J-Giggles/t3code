#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Last-resort browser launcher owns a temporary profile lifecycle.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  buildIsolatedAgentChromeCommand,
  parseIsolatedAgentChromeArgs,
} from "./lib/agent-chrome-isolated.ts";

function main(): void {
  const parsed = parseIsolatedAgentChromeArgs(process.argv.slice(2));
  const profileDirectory = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "t3code-isolated-chromium-"),
  );
  try {
    const result = NodeChildProcess.spawnSync(
      "chromium",
      buildIsolatedAgentChromeCommand(profileDirectory, parsed.url),
      { env: process.env, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Isolated Chromium exited from signal ${result.signal}.`);
    if (result.status !== 0) {
      throw new Error(`Isolated Chromium exited with status ${result.status ?? "unknown"}.`);
    }
  } finally {
    NodeFS.rmSync(profileDirectory, { recursive: true, force: true });
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
