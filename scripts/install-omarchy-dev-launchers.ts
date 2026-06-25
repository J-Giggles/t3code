#!/usr/bin/env node

import {
  formatOmarchyDevLauncherInstallResult,
  installOmarchyDevLaunchers,
  omarchyDevLauncherHelp,
  parseOmarchyDevLauncherArgs,
} from "./lib/omarchy-dev-launchers.ts";

if (import.meta.main) {
  try {
    const parsed = parseOmarchyDevLauncherArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(omarchyDevLauncherHelp());
    } else {
      const result = installOmarchyDevLaunchers({
        mode: parsed.mode,
        target: parsed.target,
      });
      process.stdout.write(formatOmarchyDevLauncherInstallResult(result));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
