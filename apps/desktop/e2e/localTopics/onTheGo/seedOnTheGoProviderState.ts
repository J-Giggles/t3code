// @effect-diagnostics nodeBuiltinImport:off - E2E setup writes isolated server settings before launch.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import type { ElectronHarnessRuntime } from "../../support/electronHarness.ts";

function resolveCodexHome(): string {
  const configured = process.env.CODEX_HOME?.trim();
  if (configured) return NodePath.resolve(configured);

  const home = process.env.HOME?.trim();
  if (home) return NodePath.join(NodePath.resolve(home), ".codex");

  throw new Error("On-the-Go headed E2E requires CODEX_HOME or HOME for provider auth.");
}

export async function seedOnTheGoProviderState(runtime: ElectronHarnessRuntime): Promise<void> {
  const binaryPath = process.env.T3CODE_E2E_CODEX_BINARY?.trim();
  const stateDir = NodePath.join(runtime.t3Home, "dev");
  await NodeFSP.mkdir(stateDir, { recursive: true });
  await NodeFSP.writeFile(
    NodePath.join(stateDir, "settings.json"),
    `${JSON.stringify(
      {
        providers: {
          codex: {
            homePath: resolveCodexHome(),
            ...(binaryPath ? { binaryPath: NodePath.resolve(binaryPath) } : {}),
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
