#!/usr/bin/env node
import {
  formatNightlyTopicStackResult,
  nightlyTopicStackHelp,
  parseNightlyTopicStackArgs,
  runNightlyTopicStack,
} from "./lib/nightly-topic-stack.ts";

if (import.meta.main) {
  try {
    const args = parseNightlyTopicStackArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(nightlyTopicStackHelp());
    } else {
      const result = runNightlyTopicStack({
        mode: args.mode,
        ...(args.rootDir === undefined ? {} : { rootDir: args.rootDir }),
      });
      process.stdout.write(formatNightlyTopicStackResult(result));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
