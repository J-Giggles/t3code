// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Tests use temp worktrees and fake git commands.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vitest";
import { LOCAL_TOPIC_MANIFEST_PATH } from "./local-topic-stack.ts";
import {
  conflictIndexSignature,
  readRecordedRepairMemory,
  restoreRecordedRepairMemory,
  writeRecordedRepairMemory,
} from "./nightly-repair-memory.ts";
import {
  createNightlyRunId,
  createNightlyTopicStackPlan,
  type NightlyCommandInvocation,
  type NightlyCommandResult,
  type NightlyCommandRunner,
  runNightlyTopicStack,
  syncNightlyControlPlaneMetadata,
} from "./nightly-topic-stack.ts";
import { hasMaterialPorcelainChanges } from "./nightly-worktree-status.ts";

const upstreamHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const topicCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const prerequisiteCommit = "cccccccccccccccccccccccccccccccccccccccc";
const followupCommit = "dddddddddddddddddddddddddddddddddddddddd";
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
  const pluginPath = NodePath.join(controlRoot, "local-plugins/test-topic/plugin.json");
  NodeFS.mkdirSync(NodePath.dirname(pluginPath), { recursive: true });
  NodeFS.writeFileSync(
    pluginPath,
    `${JSON.stringify({
      schemaVersion: 1,
      id: "test-topic",
      title: "Test topic",
      topicCommits: [topicCommit],
      ownedPaths: ["conflicted.ts", "src"],
      componentEntrypoints: [],
      verification: [],
    })}\n`,
  );
}

function createReservedWorktrees(familyRoot: string): {
  readonly originalPath: string;
  readonly nightlyPath: string;
} {
  const originalPath = NodePath.join(familyRoot, ".worktrees", "original");
  const nightlyPath = NodePath.join(familyRoot, ".worktrees", "nightly");
  NodeFS.mkdirSync(originalPath, { recursive: true });
  NodeFS.mkdirSync(nightlyPath, { recursive: true });
  return { originalPath, nightlyPath };
}

function topicAuditPath(familyRoot: string): string {
  return NodePath.join(
    familyRoot,
    ".worktrees",
    "nightly",
    ".t3code-nightly-runs",
    createNightlyRunId(runDate),
    "topic-audit.md",
  );
}

function runArtifactPath(familyRoot: string, fileName: string): string {
  return NodePath.join(
    familyRoot,
    ".worktrees",
    "nightly",
    ".t3code-nightly-runs",
    createNightlyRunId(runDate),
    fileName,
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
  readonly cherryPick?: "applied" | "empty" | "conflict" | "rerere" | "rerere-empty";
  readonly recordedRepair?: boolean;
  readonly commands: Array<NightlyCommandInvocation>;
}): NightlyCommandRunner {
  const { originalPath, nightlyPath } = createReservedWorktrees(options.familyRoot);
  let cherryPickContinued = false;
  return (invocation) => {
    options.commands.push(invocation);
    const key = commandKey(invocation);

    if (key === "git rev-parse upstream/main") {
      return ok(upstreamHead);
    }
    if (key === "git rev-parse HEAD") {
      return ok(upstreamHead);
    }
    if (key === "git status --porcelain=v1 --untracked-files=all") {
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
      if (
        options.cherryPick === "conflict" ||
        options.cherryPick === "rerere" ||
        options.cherryPick === "rerere-empty"
      ) {
        return fail(
          options.cherryPick === "rerere-empty"
            ? `error: could not apply ${topicCommit}... test topic\n`
            : "CONFLICT (content): Merge conflict.\n",
        );
      }
      return ok("");
    }
    if (key === "git rev-parse -q --verify CHERRY_PICK_HEAD") {
      if (options.cherryPick === "rerere-empty" && cherryPickContinued) {
        return fail("");
      }
      return ok(topicCommit);
    }
    if (key === "git diff --name-only --diff-filter=U") {
      return options.cherryPick === "conflict" && !cherryPickContinued
        ? ok("conflicted.ts\n")
        : ok("");
    }
    if (key === "git ls-files -u" && options.recordedRepair) {
      return ok("100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2\tconflicted.ts\n");
    }
    if (key === "git diff --quiet" || key === "git diff --cached --quiet") {
      return options.cherryPick === "conflict" ||
        options.cherryPick === "rerere" ||
        (options.cherryPick === "rerere-empty" && !cherryPickContinued)
        ? fail("")
        : ok("");
    }
    if (key === "git cherry-pick --continue") {
      cherryPickContinued = true;
      if (options.cherryPick === "rerere-empty") {
        return fail("The previous cherry-pick is now empty.\n");
      }
      return ok("");
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
  it("synchronizes declared control-plane metadata into a generated nightly commit", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const { originalPath, nightlyPath } = createReservedWorktrees(familyRoot);
    const sourcePath = NodePath.join(controlRoot, ".codex/skills/premote-nightly/SKILL.md");
    const targetPath = NodePath.join(nightlyPath, ".codex/skills/premote-nightly/SKILL.md");
    NodeFS.mkdirSync(NodePath.dirname(sourcePath), { recursive: true });
    NodeFS.mkdirSync(NodePath.dirname(targetPath), { recursive: true });
    NodeFS.writeFileSync(sourcePath, "current control plane\n");
    NodeFS.writeFileSync(targetPath, "stale control plane\n");
    const plan = createNightlyTopicStackPlan({
      controlRoot,
      repoFamilyRoot: familyRoot,
      manifest: {
        schemaVersion: 1,
        controlPlanePaths: [".codex/skills"],
        topics: [],
      },
      runId: "20260626-101112",
      dateKey: "20260626",
      upstreamRef: "upstream/main",
      upstreamHead,
      originalPath,
      original: { exists: true, dirty: false, head: upstreamHead },
      nightlyPath,
      nightly: { exists: true, dirty: false, head: upstreamHead },
    });
    const commands: Array<NightlyCommandInvocation> = [];
    const syncCommit = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const runner: NightlyCommandRunner = (invocation) => {
      commands.push(invocation);
      if (commandKey(invocation) === "git diff --cached --quiet") return fail("");
      if (commandKey(invocation) === "git rev-parse HEAD") return ok(syncCommit);
      return ok("");
    };

    assert.deepEqual(syncNightlyControlPlaneMetadata(plan, runner), {
      changed: true,
      commit: syncCommit,
    });
    assert.equal(NodeFS.readFileSync(targetPath, "utf8"), "current control plane\n");
    assert.ok(
      commands.some(
        (command) =>
          commandKey(command) === "git commit -m chore(topic-stack): sync control-plane metadata",
      ),
    );
    assert.deepEqual(
      JSON.parse(
        NodeFS.readFileSync(NodePath.join(plan.artifactsDir, "control-plane-sync.json"), "utf8"),
      ),
      {
        changed: true,
        commit: syncCommit,
        paths: [".codex/skills"],
      },
    );
  });

  it("round-trips exact conflict repair memory", () => {
    const { familyRoot } = tempFamily();
    const nightlyPath = NodePath.join(familyRoot, ".worktrees/nightly");
    NodeFS.mkdirSync(NodePath.join(nightlyPath, "src"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(nightlyPath, "src/kept.ts"), "repaired\n");
    const indexOutput = "100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2\tsrc/kept.ts\n";
    assert.equal(conflictIndexSignature(indexOutput), conflictIndexSignature(indexOutput.trim()));
    writeRecordedRepairMemory({
      repoFamilyRoot: familyRoot,
      nightlyPath,
      topicId: "test-topic",
      commit: topicCommit,
      indexOutput,
      paths: ["src/kept.ts", "src/deleted.ts"],
      repairPaths: ["src"],
      summary: "Keep the replacement and delete the obsolete file.",
      now: runDate,
    });

    const memory = readRecordedRepairMemory({
      repoFamilyRoot: familyRoot,
      topicId: "test-topic",
      commit: topicCommit,
      indexOutput,
    });
    assert.ok(memory);
    NodeFS.writeFileSync(NodePath.join(nightlyPath, "src/kept.ts"), "wrong\n");
    NodeFS.writeFileSync(NodePath.join(nightlyPath, "src/deleted.ts"), "restore me\n");
    restoreRecordedRepairMemory(nightlyPath, memory, ["src"]);
    assert.equal(
      NodeFS.readFileSync(NodePath.join(nightlyPath, "src/kept.ts"), "utf8"),
      "repaired\n",
    );
    assert.equal(NodeFS.existsSync(NodePath.join(nightlyPath, "src/deleted.ts")), false);
    assert.equal(
      readRecordedRepairMemory({
        repoFamilyRoot: familyRoot,
        topicId: "test-topic",
        commit: topicCommit,
        indexOutput: `${indexOutput}changed`,
      }),
      undefined,
    );
  });

  it("reuses a recorded repair when rerere leaves an exact subset of the conflict", () => {
    const { familyRoot } = tempFamily();
    const nightlyPath = NodePath.join(familyRoot, ".worktrees/nightly");
    NodeFS.mkdirSync(NodePath.join(nightlyPath, "src"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(nightlyPath, "src/first.ts"), "first repaired\n");
    NodeFS.writeFileSync(NodePath.join(nightlyPath, "src/second.ts"), "second repaired\n");
    const firstEntry = "100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2\tsrc/first.ts";
    const secondEntry = "100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3\tsrc/second.ts";
    writeRecordedRepairMemory({
      repoFamilyRoot: familyRoot,
      nightlyPath,
      topicId: "test-topic",
      commit: topicCommit,
      indexOutput: `${firstEntry}\n${secondEntry}\n`,
      paths: ["src/first.ts", "src/second.ts"],
      repairPaths: ["src"],
      summary: "Keep both repaired files.",
      now: runDate,
    });

    const memory = readRecordedRepairMemory({
      repoFamilyRoot: familyRoot,
      topicId: "test-topic",
      commit: topicCommit,
      indexOutput: `${secondEntry}\n`,
    });
    assert.deepEqual(
      memory?.files.map((file) => file.path),
      ["src/second.ts"],
    );
    assert.equal(
      readRecordedRepairMemory({
        repoFamilyRoot: familyRoot,
        topicId: "test-topic",
        commit: topicCommit,
        indexOutput: "100644 cccccccccccccccccccccccccccccccccccccccc 3\tsrc/second.ts\n",
      }),
      undefined,
    );
  });

  it("does not treat replay evidence directories as dirty worktree state", () => {
    assert.equal(hasMaterialPorcelainChanges("?? .t3code-nightly-runs/run/plan.json\n"), false);
    assert.equal(
      hasMaterialPorcelainChanges("?? .t3code-nightly-agent-runs/run/report.md\n"),
      false,
    );
    assert.equal(
      hasMaterialPorcelainChanges("?? apps/desktop/test-results/nightly-public/run/pass.png\n"),
      false,
    );
    assert.equal(hasMaterialPorcelainChanges("?? apps/web/playwright-report/index.html\n"), false);
    assert.equal(hasMaterialPorcelainChanges(" M apps/web/src/example.ts\n"), true);
  });

  it("creates a missing original worktree before resetting it", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const originalPath = NodePath.join(familyRoot, ".worktrees/original");
    const nightlyPath = NodePath.join(familyRoot, ".worktrees/nightly");
    const plan = createNightlyTopicStackPlan({
      controlRoot,
      repoFamilyRoot: familyRoot,
      manifest: {
        schemaVersion: 1,
        topics: [],
      },
      runId: "20260626-101112",
      dateKey: "20260626",
      upstreamRef: "upstream/main",
      upstreamHead,
      originalPath,
      original: { exists: false, dirty: false },
      nightlyPath,
      nightly: { exists: false, dirty: false },
    });

    const descriptions = plan.commands.map((command) => command.description);
    assert.equal(plan.blockers.length, 0);
    assert.ok(
      descriptions.indexOf("create original worktree") <
        descriptions.indexOf("reset original to upstream/main"),
    );
  });

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
            prerequisiteCommits: [],
            commits: [topicCommit],
            followupCommits: [],
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

  it("installs frozen nightly dependencies before final verification", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const { originalPath, nightlyPath } = createReservedWorktrees(familyRoot);
    const plan = createNightlyTopicStackPlan({
      controlRoot,
      repoFamilyRoot: familyRoot,
      manifest: { schemaVersion: 1, topics: [] },
      runId: "20260626-101112",
      dateKey: "20260626",
      upstreamRef: "upstream/main",
      upstreamHead,
      originalPath,
      original: { exists: true, dirty: false, head: upstreamHead },
      nightlyPath,
      nightly: { exists: true, dirty: false, head: upstreamHead },
    });
    const descriptions = plan.commands.map((command) => command.description);
    assert.ok(
      descriptions.indexOf("reconcile upstream dependency versions") <
        descriptions.indexOf("install nightly dependencies"),
    );
    assert.ok(
      descriptions.indexOf("install nightly dependencies") < descriptions.indexOf("run vp check"),
    );
  });

  it("plans prerequisite, primary, and followup commits in replay order", () => {
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
            prerequisiteCommits: [prerequisiteCommit],
            commits: [topicCommit],
            followupCommits: [followupCommit],
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
        dirty: false,
        head: upstreamHead,
      },
      nightlyPath,
      nightly: {
        exists: true,
        dirty: false,
        head: upstreamHead,
      },
    });

    assert.deepStrictEqual(plan.topics[0]?.commits, [
      prerequisiteCommit,
      topicCommit,
      followupCommit,
    ]);
    assert.deepStrictEqual(
      plan.commands
        .filter((command) => command.description === "cherry-pick test-topic")
        .map((command) => command.args),
      [
        ["cherry-pick", prerequisiteCommit],
        ["cherry-pick", topicCommit],
        ["cherry-pick", followupCommit],
      ],
    );
  });

  it("fails closed when nightly is dirty", () => {
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

  it("auto-applies exact recorded memory when rerere cannot represent the conflict", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({
      familyRoot,
      controlRoot,
      commands,
      cherryPick: "conflict",
      recordedRepair: true,
    });
    const nightlyPath = NodePath.join(familyRoot, ".worktrees/nightly");
    const indexOutput = "100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2\tconflicted.ts\n";
    writeRecordedRepairMemory({
      repoFamilyRoot: familyRoot,
      nightlyPath,
      topicId: "test-topic",
      commit: topicCommit,
      indexOutput,
      paths: ["conflicted.ts"],
      repairPaths: ["conflicted.ts"],
      summary: "Keep the upstream deletion.",
      now: runDate,
    });

    const result = runNightlyTopicStack({
      mode: "apply",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    assert.equal(result.topicRecords[0]?.status, "auto-resolved");
    assert.ok(commands.some((command) => command.description === "stage recorded repair memory"));
    assert.ok(
      commands.some((command) => command.description === "continue recorded repair memory"),
    );
  });

  it("continues a rerere-resolved cherry-pick automatically", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands, cherryPick: "rerere" });

    const result = runNightlyTopicStack({
      mode: "apply",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    assert.equal(result.topicRecords[0]?.status, "auto-resolved");
    assert.ok(commands.some((command) => commandKey(command) === "git cherry-pick --continue"));
  });

  it("skips a rerere-resolved cherry-pick that becomes a clean no-op", () => {
    const { familyRoot, controlRoot } = tempFamily();
    const commands: Array<NightlyCommandInvocation> = [];
    const runner = createRunner({ familyRoot, controlRoot, commands, cherryPick: "rerere-empty" });

    const result = runNightlyTopicStack({
      mode: "apply",
      rootDir: controlRoot,
      now: runDate,
      runner,
    });

    assert.equal(result.topicRecords[0]?.status, "empty-skipped");
    assert.ok(commands.some((command) => commandKey(command) === "git cherry-pick --continue"));
    assert.ok(!commands.some((command) => commandKey(command) === "git cherry-pick --skip"));
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

    const failurePath = runArtifactPath(familyRoot, "failure.txt");
    const packetPath = runArtifactPath(familyRoot, "conflict-packet.md");
    const promptPath = runArtifactPath(familyRoot, "hermes-conflict-prompt.md");
    assert.equal(NodeFS.existsSync(failurePath), true);
    assert.equal(NodeFS.existsSync(packetPath), true);
    assert.equal(NodeFS.existsSync(promptPath), true);
    assert.match(NodeFS.readFileSync(failurePath, "utf8"), /Cherry-pick conflict/);
    assert.match(NodeFS.readFileSync(topicAuditPath(familyRoot), "utf8"), /stopped on conflict/);
    assert.match(NodeFS.readFileSync(packetPath, "utf8"), /Nightly Conflict Packet/);
    assert.match(NodeFS.readFileSync(promptPath, "utf8"), /read the conflict packet/i);
  });
});
