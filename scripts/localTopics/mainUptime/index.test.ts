// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Tests exercise generated shell and temp Git repos.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { installMainUptime, renderMainUptimeFiles } from "./index.ts";

function run(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env?: NodeJS.ProcessEnv,
): string {
  try {
    return NodeChildProcess.execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      ...(env ? { env: { ...process.env, ...env } } : {}),
    }).trim();
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const stderr = String(error.stderr).trim();
      throw new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`, { cause: error });
    }
    throw error;
  }
}

function makeFixture(): {
  readonly root: string;
  readonly homeDir: string;
  readonly repoRoot: string;
} {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-main-uptime-"));
  const homeDir = NodePath.join(root, "home");
  const repoRoot = NodePath.join(homeDir, "code", "t3code");
  NodeFS.mkdirSync(repoRoot, { recursive: true });
  run("git", ["init", "-b", "main"], repoRoot);
  run("git", ["config", "user.name", "T3 Test"], repoRoot);
  run("git", ["config", "user.email", "t3@example.test"], repoRoot);
  NodeFS.writeFileSync(NodePath.join(repoRoot, "README.md"), "approved\n");
  run("git", ["add", "README.md"], repoRoot);
  run("git", ["commit", "-m", "approved"], repoRoot);
  return { root, homeDir, repoRoot };
}

function cleanup(root: string): void {
  NodeFS.rmSync(root, { recursive: true, force: true });
}

function installedScript(homeDir: string): string {
  return NodePath.join(homeDir, ".local", "bin", "t3code-main-uptime");
}

function testEnv(fixture: {
  readonly homeDir: string;
  readonly repoRoot: string;
}): NodeJS.ProcessEnv {
  return {
    T3CODE_MAIN_ROOT: fixture.repoRoot,
    T3CODE_MAIN_UPTIME_STATE_DIR: NodePath.join(
      fixture.homeDir,
      ".local",
      "state",
      "t3code-main-uptime",
    ),
    T3CODE_MAIN_UPTIME_SYSTEMCTL: "/usr/bin/true",
    T3CODE_MAIN_UPTIME_CURL: "/usr/bin/true",
  };
}

describe("main uptime installer", () => {
  it("renders the supervisor, integrity guard, and health units", () => {
    const files = renderMainUptimeFiles({ homeDir: "/home/test", repoRoot: "/srv/t3code" });
    expect(files.map((file) => file.path)).toEqual([
      "/home/test/.local/bin/t3code-main-uptime",
      "/home/test/.config/systemd/user/t3code-main.service",
      "/home/test/.config/systemd/user/t3code-main-guard.service",
      "/home/test/.config/systemd/user/t3code-main-guard.timer",
      "/home/test/.config/systemd/user/t3code-main-health.service",
      "/home/test/.config/systemd/user/t3code-main-health.timer",
    ]);
    expect(files[0]?.content).toContain('ROOT="${T3CODE_MAIN_ROOT:-/srv/t3code}"');
    expect(files[1]?.content).toContain("Restart=always");
    expect(files[1]?.content).toContain("t3code-main-uptime launch-preflight");
    expect(files[3]?.content).toContain("OnUnitActiveSec=5s");
    expect(files[5]?.content).toContain("OnUnitActiveSec=30s");
  });

  it("renders a bash-valid guard script", () => {
    const fixture = makeFixture();
    try {
      const script = renderMainUptimeFiles(fixture)[0]!;
      NodeFS.writeFileSync(NodePath.join(fixture.root, "guard.sh"), script.content);
      const result = NodeChildProcess.spawnSync(
        "bash",
        ["-n", NodePath.join(fixture.root, "guard.sh")],
        {
          encoding: "utf8",
        },
      );
      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanup(fixture.root);
    }
  });

  it("dry-runs without writing and write mode initializes the approved SHA", () => {
    const fixture = makeFixture();
    try {
      const dryRun = installMainUptime({
        mode: "dry-run",
        homeDir: fixture.homeDir,
        repoRoot: fixture.repoRoot,
      });
      expect(dryRun.entries.every((entry) => entry.action === "create" && !entry.written)).toBe(
        true,
      );
      expect(NodeFS.existsSync(installedScript(fixture.homeDir))).toBe(false);

      const installed = installMainUptime({
        mode: "write",
        homeDir: fixture.homeDir,
        repoRoot: fixture.repoRoot,
      });
      expect(installed.approvedHeadInitialized).toBe(true);
      expect(installed.approvedHead).toBe(run("git", ["rev-parse", "HEAD"], fixture.repoRoot));
      expect(NodeFS.statSync(installedScript(fixture.homeDir)).mode & 0o777).toBe(0o755);
    } finally {
      cleanup(fixture.root);
    }
  });

  it("preserves and rolls back unauthorized dirty and committed changes", () => {
    const fixture = makeFixture();
    try {
      installMainUptime({ mode: "write", homeDir: fixture.homeDir, repoRoot: fixture.repoRoot });
      const script = installedScript(fixture.homeDir);
      const approved = run("git", ["rev-parse", "HEAD"], fixture.repoRoot);
      NodeFS.writeFileSync(NodePath.join(fixture.repoRoot, "README.md"), "dirty\n");
      run(script, ["guard"], fixture.repoRoot, testEnv(fixture));
      expect(NodeFS.readFileSync(NodePath.join(fixture.repoRoot, "README.md"), "utf8")).toBe(
        "approved\n",
      );

      NodeFS.writeFileSync(NodePath.join(fixture.repoRoot, "README.md"), "committed\n");
      run("git", ["add", "README.md"], fixture.repoRoot);
      run("git", ["commit", "-m", "unauthorized"], fixture.repoRoot);
      run(script, ["guard"], fixture.repoRoot, testEnv(fixture));
      expect(run("git", ["rev-parse", "HEAD"], fixture.repoRoot)).toBe(approved);
      const incidents = NodeFS.readdirSync(
        NodePath.join(fixture.homeDir, ".local", "state", "t3code-main-uptime", "incidents"),
      );
      expect(incidents).toHaveLength(2);
    } finally {
      cleanup(fixture.root);
    }
  });

  it("allows only the locked candidate to become the approved Main SHA", () => {
    const fixture = makeFixture();
    try {
      installMainUptime({ mode: "write", homeDir: fixture.homeDir, repoRoot: fixture.repoRoot });
      const script = installedScript(fixture.homeDir);
      const env = testEnv(fixture);
      run("git", ["checkout", "-b", "candidate"], fixture.repoRoot);
      NodeFS.writeFileSync(NodePath.join(fixture.repoRoot, "README.md"), "candidate\n");
      run("git", ["add", "README.md"], fixture.repoRoot);
      run("git", ["commit", "-m", "candidate"], fixture.repoRoot);
      const candidate = run("git", ["rev-parse", "HEAD"], fixture.repoRoot);
      run("git", ["checkout", "main"], fixture.repoRoot);

      run(script, ["promotion-begin", candidate, "60"], fixture.repoRoot, env);
      run("git", ["reset", "--hard", candidate], fixture.repoRoot);
      run(script, ["launch-preflight"], fixture.repoRoot, env);
      run(script, ["guard"], fixture.repoRoot, env);
      expect(run("git", ["rev-parse", "HEAD"], fixture.repoRoot)).toBe(candidate);
      expect(() => run(script, ["promotion-approve", candidate], fixture.repoRoot, env)).toThrow(
        /missing strict Main public verification proof/u,
      );
      const stateDir = NodePath.join(fixture.homeDir, ".local", "state", "t3code-main-uptime");
      NodeFS.writeFileSync(
        NodePath.join(stateDir, "main-public-proof"),
        `${candidate} ${Math.floor(Date.now() / 1_000)}\n`,
      );
      run(script, ["promotion-approve", candidate], fixture.repoRoot, env);

      const approvedPath = NodePath.join(stateDir, "approved-head");
      expect(NodeFS.readFileSync(approvedPath, "utf8").trim()).toBe(candidate);
      expect(
        NodeFS.existsSync(NodePath.join(NodePath.dirname(approvedPath), "promotion.lock")),
      ).toBe(false);
      expect(NodeFS.existsSync(NodePath.join(stateDir, "last-approved-main-public-proof"))).toBe(
        true,
      );
    } finally {
      cleanup(fixture.root);
    }
  });
});
