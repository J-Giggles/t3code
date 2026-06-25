// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Tests use temp files and bash syntax checks.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  installOmarchyDevLaunchers,
  renderOmarchyDevLauncherFiles,
} from "./omarchy-dev-launchers.ts";

function makeTempHome(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omarchy-launchers-"));
}

function cleanupTempHome(homeDir: string): void {
  NodeFS.rmSync(homeDir, { recursive: true, force: true });
}

function scriptContent(
  target: "original" | "main" | "staging" | "manual-port",
  homeDir = "/home/tester",
): string {
  const file = renderOmarchyDevLauncherFiles({ homeDir, target }).find(
    (candidate) => candidate.kind === "script",
  );
  if (!file) {
    throw new Error(`Missing script for ${target}`);
  }
  return file.content;
}

describe("omarchy-dev-launchers", () => {
  it("renders all launcher names", () => {
    const files = renderOmarchyDevLauncherFiles({ homeDir: "/home/tester" });
    expect(files.filter((file) => file.kind === "script").map((file) => file.path)).toEqual([
      "/home/tester/.local/bin/t3code-dev-original",
      "/home/tester/.local/bin/t3code-dev-main",
      "/home/tester/.local/bin/t3code-dev-staging",
      "/home/tester/.local/bin/t3code-dev-manual-port",
    ]);
    expect(files.filter((file) => file.kind === "desktop-entry").map((file) => file.path)).toEqual([
      "/home/tester/.local/share/applications/t3code-dev-original.desktop",
      "/home/tester/.local/share/applications/t3code-dev-main.desktop",
      "/home/tester/.local/share/applications/t3code-dev-staging.desktop",
      "/home/tester/.local/share/applications/t3code-dev-manual-port.desktop",
    ]);
  });

  it("keeps main process matching away from nested worktrees", () => {
    const content = scriptContent("main");
    expect(content).toMatch(/\$WORKTREE\/\.worktrees/u);
    expect(content.includes('[[ "$value" == *"$WORKTREE/.worktrees/"* ]]')).toBe(true);
  });

  it("sets manual restart policy and restart-on-exit for every target", () => {
    for (const target of ["original", "main", "staging", "manual-port"] as const) {
      const content = scriptContent(target);
      expect(content).toMatch(/export T3CODE_DEV_CHANGE_POLICY="manual"/u);
      expect(content).toMatch(/export T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE="1"/u);
      expect(content).toMatch(/export T3CODE_DESKTOP_RESTART_ON_EXIT="1"/u);
    }
  });

  it("preserves target-specific command and worktree route bindings", () => {
    expect(scriptContent("original")).toMatch(/mise exec node@24\.13\.1 -- pnpm run dev:desktop/u);
    expect(scriptContent("main")).toMatch(/\n  pnpm run dev:desktop\n/u);

    const staging = scriptContent("staging");
    expect(staging).not.toMatch(/T3CODE_TAILSCALE_SERVE_PATH/u);
    expect(staging).toMatch(/export T3CODE_DEV_INSTANCE="staging"/u);
    expect(staging).toMatch(/export T3CODE_WORKSPACE_SLUG="staging"/u);
    expect(staging).toMatch(/export T3CODE_WORKTREE_ROLE="staging"/u);

    const manualPort = scriptContent("manual-port");
    expect(manualPort).toMatch(/export T3CODE_PORT_OFFSET="80"/u);
    expect(manualPort).toMatch(/export T3CODE_PORT="13853"/u);
    expect(manualPort).toMatch(/export PORT="5813"/u);
    expect(manualPort).toMatch(
      /export T3CODE_WORKSPACE_SLUG="dev-staging-upstream-manual-port-20260624"/u,
    );
    expect(manualPort).toMatch(/export T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT="9233"/u);
  });

  it("renders launcher scripts that pass bash syntax checks", () => {
    const homeDir = makeTempHome();
    try {
      for (const file of renderOmarchyDevLauncherFiles({ homeDir }).filter(
        (candidate) => candidate.kind === "script",
      )) {
        const scriptPath = NodePath.join(homeDir, NodePath.basename(file.path));
        NodeFS.writeFileSync(scriptPath, file.content);
        const result = NodeChildProcess.spawnSync("bash", ["-n", scriptPath], {
          encoding: "utf8",
        });
        expect(
          result.status,
          `${file.target} failed bash -n: ${result.stderr || result.stdout}`,
        ).toBe(0);
      }
    } finally {
      cleanupTempHome(homeDir);
    }
  });

  it("dry-run reports intended paths without writing target paths", () => {
    const homeDir = makeTempHome();
    try {
      const result = installOmarchyDevLaunchers({
        mode: "dry-run",
        homeDir,
        validateWorktrees: false,
      });

      expect(result.entries).toHaveLength(8);
      for (const entry of result.entries) {
        expect(entry.action).toBe("create");
        expect(entry.written).toBe(false);
        expect(NodeFS.existsSync(entry.path)).toBe(false);
      }
    } finally {
      cleanupTempHome(homeDir);
    }
  });

  it("write mode creates backups only when content differs", () => {
    const homeDir = makeTempHome();
    const now = new Date("2026-06-18T12:00:00.000Z");
    try {
      const first = installOmarchyDevLaunchers({
        mode: "write",
        target: "main",
        homeDir,
        now,
        validateWorktrees: false,
      });
      expect(first.entries.map((entry) => entry.action)).toEqual(["create", "create"]);
      expect(first.entries.map((entry) => entry.backupPath)).toEqual([undefined, undefined]);

      const second = installOmarchyDevLaunchers({
        mode: "write",
        target: "main",
        homeDir,
        now,
        validateWorktrees: false,
      });
      expect(second.entries.map((entry) => entry.action)).toEqual(["unchanged", "unchanged"]);

      const scriptPath = NodePath.join(homeDir, ".local", "bin", "t3code-dev-main");
      NodeFS.writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 0\n");
      const third = installOmarchyDevLaunchers({
        mode: "write",
        target: "main",
        homeDir,
        now,
        validateWorktrees: false,
      });

      const scriptEntry = third.entries.find((entry) => entry.kind === "script");
      const desktopEntry = third.entries.find((entry) => entry.kind === "desktop-entry");
      expect(scriptEntry?.action).toBe("update");
      if (!scriptEntry?.backupPath) {
        throw new Error("Expected script backup path");
      }
      expect(NodeFS.existsSync(scriptEntry.backupPath)).toBe(true);
      expect(desktopEntry?.action).toBe("unchanged");
      expect(desktopEntry?.backupPath).toBe(undefined);
    } finally {
      cleanupTempHome(homeDir);
    }
  });
});
