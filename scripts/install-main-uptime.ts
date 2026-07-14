#!/usr/bin/env node

import {
  formatMainUptimeInstallResult,
  installMainUptime,
  mainUptimeHelp,
  parseMainUptimeArgs,
} from "./localTopics/mainUptime/index.ts";

if (import.meta.main) {
  try {
    const parsed = parseMainUptimeArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(mainUptimeHelp());
    } else {
      const result = installMainUptime({
        mode: parsed.mode,
        ...(parsed.homeDir ? { homeDir: parsed.homeDir } : {}),
        ...(parsed.repoRoot ? { repoRoot: parsed.repoRoot } : {}),
      });
      process.stdout.write(formatMainUptimeInstallResult(result));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
