#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Small metadata validation CLI.
import * as NodePath from "node:path";
import {
  formatLocalTopicPluginValidationResult,
  validateLocalTopicPlugins,
} from "./lib/local-topic-stack.ts";

interface ParsedValidateArgs {
  readonly rootDir: string;
  readonly help: boolean;
  readonly strict: boolean;
}

function parseValidateArgs(args: ReadonlyArray<string>): ParsedValidateArgs {
  let rootDir = process.cwd();
  let help = false;
  let strict = true;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--permissive") {
      strict = false;
    } else if (arg === "--root") {
      rootDir = args[++index] ?? rootDir;
    } else if (arg.startsWith("--root=")) {
      rootDir = arg.slice("--root=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    rootDir: NodePath.resolve(rootDir),
    help,
    strict,
  };
}

function helpText(): string {
  return [
    "Usage: pnpm run topic-plugins:check -- [--root <repo-root>] [--permissive]",
    "",
    "Validates docs/operations/jordan-topic-stack.manifest.json and local-plugins/* metadata.",
    "Strict mode is the default and rejects v1 or pending componentization metadata.",
    "",
  ].join("\n");
}

if (import.meta.main) {
  try {
    const args = parseValidateArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(helpText());
    } else {
      const result = validateLocalTopicPlugins(args.rootDir, { strict: args.strict });
      process.stdout.write(formatLocalTopicPluginValidationResult(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
