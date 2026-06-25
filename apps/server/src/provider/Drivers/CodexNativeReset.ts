import type { CodexSettings, ServerProviderNativeResetResult } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  materializeCodexShadowHome,
  resolveCodexHomeLayout,
  type CodexHomeLayout,
} from "./CodexHomeLayout.ts";

const CODEX_EXTRAS_DIRECTORIES = ["skills", "plugins"] as const;

function isMcpServerTableHeader(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "[mcp_servers]" || /^\[mcp_servers(?:\.[^\]]+)+\]$/.test(trimmed);
}

function isTomlTableHeader(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line);
}

export function removeCodexMcpServerTables(configToml: string): string {
  const lines = configToml.split(/\r?\n/);
  const output: string[] = [];
  let dropping = false;

  for (const line of lines) {
    if (isMcpServerTableHeader(line)) {
      dropping = true;
      continue;
    }
    if (dropping && isTomlTableHeader(line)) {
      dropping = false;
    }
    if (!dropping) {
      output.push(line);
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

const removeIfPresent = Effect.fn("CodexNativeReset.removeIfPresent")(function* (
  pathValue: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  yield* fileSystem
    .remove(pathValue, { recursive: true, force: true })
    .pipe(Effect.orElseSucceed(() => undefined));
});

const resetConfigToml = Effect.fn("CodexNativeReset.resetConfigToml")(function* (homePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configPath = path.join(homePath, "config.toml");
  const exists = yield* fileSystem.exists(configPath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) return;
  const current = yield* fileSystem.readFileString(configPath);
  const next = removeCodexMcpServerTables(current);
  if (next !== current) {
    yield* fileSystem.writeFileString(configPath, next);
  }
});

const resetSharedHome = Effect.fn("CodexNativeReset.resetSharedHome")(function* (
  layout: CodexHomeLayout,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(layout.sharedHomePath, { recursive: true });
  yield* Effect.forEach(
    CODEX_EXTRAS_DIRECTORIES,
    (directory) => removeIfPresent(path.join(layout.sharedHomePath, directory)),
    { discard: true },
  );
  yield* resetConfigToml(layout.sharedHomePath);
});

export const resetCodexNativeProviderState = Effect.fn("resetCodexNativeProviderState")(
  function* (
    config: CodexSettings,
  ): Effect.fn.Return<ServerProviderNativeResetResult, Error, FileSystem.FileSystem | Path.Path> {
    const layout = yield* resolveCodexHomeLayout(config);
    yield* resetSharedHome(layout);
    yield* materializeCodexShadowHome(layout);
    return {
      status: "completed",
      detail: `Reset Codex extras in ${layout.sharedHomePath}.`,
    };
  },
  Effect.mapError((cause) => (cause instanceof Error ? cause : new Error(String(cause)))),
);
