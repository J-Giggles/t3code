// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Tests use temp worktrees and fake git commands.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vitest";
import { LOCAL_TOPIC_MANIFEST_PATH } from "./local-topic-stack.ts";
import {
  createNightlyRunId,
  createNightlyTopicStackPlan,
  type NightlyCommandInvocation,
  type NightlyCommandResult,
  type NightlyCommandRunner,
  runNightlyTopicStack,
} from "./nightly-topic-stack.ts";

const upstreamHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const topicCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const runDate = new Date("2026-06-26T10:11:12.000Z");

function tempFamily(): { readonly familyRoot: string; readonly controlRoot: string } {
  const familyRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nightly-topic-stack-"));
  const controlRoot = NodePath.join(familyRoot, ".worktrees", "control");
  NodeFS.mkdirSync(controlRoot, { recursive: true });
  writeManifest(controlRoot);
  return { familyRoot, controlRoot };
}

function writeManifest(controlRoot: string): void {
  const manifestPath = NodePath.join(controlRoot, LOCAL_TOPIC_MANIFEST_PATH);
  NodeFS.mkdirSync(NodePath.dirname(manifestPath), { recursive: true });
  NodeFS.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        topics: [
          {
            id: "test-topic",
            pluginPath: "local-plugins/test-topic",
            commits: [topicCommit],
            subject: "feat(test): add test topic",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function createReservedWorktrees(familyRoot: string): {
  readonly originalPath: string;
  readonly nightlyPath: string;
} {
  const originalPath = NodePath.join(familyRoot, ".worktrees", "original");
  const nightlyPath = NodePath.join(familyRoot, ".worktrees", "nightly-local");
  NodeFS.mkdirSync(originalPath, { recursive: true });
  NodeFS.mkdirSync(nightlyPath, { recursive: true });
  return { originalPath, nightlyPath };
}

function topicAuditPath(familyRoot: string): string {
  return NodePath.join(
    familyRoot,
    ".worktrees",
    "nightly-local",
    ".t3code-nightly-runs",
    createNightlyRunId(runDate),
    "topic-audit.md",
  );
}

function commandKey(invocation: NightlyCommandInvocation): string {
  return [invocation.command, ...invocation.args].join(" ");
}

function createRunner(options: {
  readonly familyRoot: string;
  readonly controlRoot: string;
  readonly originalDirty?: boolean;
  readonly nightlyDirty?: boolean;
  readonly cherryPick?: "applied" | "empty" | "conflict";
  readonly commands: Array<NightlyCommandInvocation>;
}): NightlyCommandRunner {
  const { originalPath, nightlyPath } = createReservedWorktrees(options.familyRoot);
  return (invocation) => {
    options.commands.push(invocation);
    const key = commandKey(invocation);

    if (key === "git rev-parse upstream/main") {
      return ok(upstreamHead);
    }
    if (key === "git rev-parse HEAD") {
      return ok(upstreamHead);
    }
    if (key === "git status --porcelain=v1") {
      if (invocation.cwd === originalPath && options.originalDirty) {
        return ok(" M local.txt\n");
      }
      if (invocation.cwd === nightlyPath && options.nightlyDirty) {
        return ok("?? scratch.txt\n");
      }
      return ok("");
    }
    if (key === `git cherry-pick ${topicCommit}`) {
      if (options.cherryPick === "empty") {
        return fail("The previous cherry-pick is now empty.\n");
      }
      if (options.cherryPick === "conflict") {
        return fail("CONFLICT (content): Merge conflict.\n");
      }
      return ok("");
    }
    if (key === "git rev-parse -q --verify CHERRY_PICK_HEAD") {
      return ok(topicCommit);
    }
    if (key === "git diff --quiet" || key === "git diff --cached --quiet") {
      return options.cherryPick === "conflict" ? fail("") : ok("");
    }
    if (key === "git cherry-pick --skip") {
      return ok("");
    }

    return ok("");
  };
}

function ok(stdout: string): NightlyCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): NightlyCommandResult {
  return { exitCode: 1, stdout: "", stderr };
}

describe("nightly topic stack", () => {
  it("plans original backup before reset when original is dirty", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const { originalPath, nightlyPath } = createReservedWorktrees(familyRoot);
    const plan = createNightlyTopicStackPlan({
      controlRoot,
      repoFamilyRoot: familyRoot,
      manifest: {
        schemaVersion: 1,
        topics: [
          {
            id: "test-topic",
            pluginPath: "local-plugins/test-topic",
            commits: [topicCommit],
            subject: "feat(test): add test topic",
          },
        ],
      },
      runId: "20260626-101112",
      dateKey: "20260626",
      upstreamRef: "upstream/main",
      upstreamHead,
      originalPath,
      original: {
        exists: true,
        dirty: true,
        head: "cccccccccccccccccccccccccccccccccccccccc",
      },
      nightlyPath,
      nightly: {
        exists: true,
        dirty: false,
        head: upstreamHead,
      },
    });

    const descriptions = plan.commands.map((command) => command.description);
    assert.ok(
      descriptions.indexOf("backup original HEAD before reset") <
        descriptions.indexOf("reset original to upstream/main"),
    );
    assert.ok(
      descriptions.indexOf("stash dirty original changes") <
        descriptions.indexOf("reset original to upstream/main"),
    );
  });

  it("does not execute mutating commands during dry-run", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands });

    const result = runNightlyTopicStack({
      mode: "dry-run",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    assert.equal(result.topicRecords[0]?.status, "pending");
    assert.deepStrictEqual(
      commands.filter((command) => command.mutates),
      [],
    );
  });

  it("fails closed when nightly-local is dirty", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands, nightlyDirty: true });

    assert.throws(() =>
      runNightlyTopicStack({
        mode: "apply",
        rootDir: controlRoot,
        now: runDate,
        runner,
      }),
    );
    assert.deepStrictEqual(
      commands.filter((command) => command.mutates),
      [],
    );
  });

  it("records and skips an empty cherry-pick", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands, cherryPick: "empty" });

    const result = runNightlyTopicStack({
      mode: "apply",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    assert.equal(result.topicRecords[0]?.status, "empty-skipped");
    assert.ok(commands.some((command) => commandKey(command) === "git cherry-pick --skip"));
  });

  it("writes a topic replay audit stub during apply", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands });

    const result = runNightlyTopicStack({
      mode: "apply",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    const audit = NodeFS.readFileSync(topicAuditPath(familyRoot), "utf8");
    assert.equal(result.topicRecords[0]?.status, "applied");
    assert.match(audit, /# Topic Replay Audit/);
    assert.match(audit, /## Branch Diffs Audited/);
    assert.match(audit, /- \[ \] `test-topic`: checklist reviewed/);
    assert.match(audit, /## Promotion Sign-Off/);
  });

  it("stops on conflict and writes failure artifacts", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands, cherryPick: "conflict" });

    assert.throws(() =>
      runNightlyTopicStack({
        mode: "apply",
        rootDir: controlRoot,
        now: runDate,
        runner,
      }),
    );

    const failurePath = NodePath.join(
      familyRoot,
      ".worktrees",
      "nightly-local",
      ".t3code-nightly-runs",
      createNightlyRunId(runDate),
      "failure.txt",
    );
    assert.equal(NodeFS.existsSync(failurePath), true);
    assert.match(NodeFS.readFileSync(failurePath, "utf8"), /Cherry-pick conflict/);
    assert.match(NodeFS.readFileSync(topicAuditPath(familyRoot), "utf8"), /stopped on conflict/);
  });
});
