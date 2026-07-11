#!/usr/bin/env node

import {
  agentChromeBrowserHelp,
  formatAgentChromeBrowserSetupResult,
  parseAgentChromeBrowserArgs,
  setupAgentChromeBrowser,
} from "./lib/agent-chrome-browser.ts";

if (import.meta.main) {
  try {
    const parsed = parseAgentChromeBrowserArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(agentChromeBrowserHelp());
    } else {
      const result = setupAgentChromeBrowser(parsed.mode);
      process.stdout.write(formatAgentChromeBrowserSetupResult(result));
      if (parsed.mode === "doctor" && !result.ready) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
