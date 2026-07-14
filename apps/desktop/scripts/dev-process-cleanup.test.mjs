import { assert, describe, it } from "vite-plus/test";

import { cleanupDarwinDevProcesses } from "./dev-process-cleanup.mjs";

describe("darwin development process cleanup", () => {
  it("terminates app children before the LaunchServices-owned app process", () => {
    const calls = [];
    const spawnSync = (command, args) => {
      calls.push([command, args]);
      return command === "pgrep" ? { status: 0, stdout: "120\n121\n" } : { status: 0 };
    };

    cleanupDarwinDevProcesses({
      devRootArg: "--t3code-dev-root=/repo/apps/desktop",
      signal: "TERM",
      spawnSync,
    });

    assert.deepEqual(calls, [
      ["pgrep", ["-f", "--", "--t3code-dev-root=/repo/apps/desktop"]],
      ["pkill", ["-TERM", "-P", "120"]],
      ["pkill", ["-TERM", "-P", "121"]],
      ["pkill", ["-TERM", "-f", "--", "--t3code-dev-root=/repo/apps/desktop"]],
    ]);
  });
});
