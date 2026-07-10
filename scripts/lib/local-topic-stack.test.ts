// @effect-diagnostics nodeBuiltinImport:off - Tests create temporary plugin metadata folders.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vitest";
import {
  LOCAL_TOPIC_MANIFEST_PATH,
  localTopicRepairPaths,
  readLocalTopicManifest,
  REQUIRED_REPLAY_CHECKLIST_HEADINGS,
  REQUIRED_TOPIC_README_HEADINGS,
  validateLocalTopicPlugins,
} from "./local-topic-stack.ts";
import { resolveTopicRepairPaths } from "./nightly-topic-repair-scope.ts";

function tempRoot(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "local-topic-stack-"));
}

function writeJson(path: string, value: unknown): void {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

type ReplayChecklistFixtureMode =
  | "valid"
  | "not-applicable"
  | "missing-item"
  | "unchecked"
  | "missing-evidence"
  | "missing-evidence-path"
  | "too-few-non-na";

function replayChecklistLineForHeading(heading: string, mode: ReplayChecklistFixtureMode): string {
  if (mode === "missing-item" && heading === "## Added UI") {
    return "Test content.";
  }
  if (mode === "not-applicable") {
    return "- [x] Not applicable: this fixture section has no topic-owned behavior.";
  }
  if (mode === "too-few-non-na" && heading !== "## Added Features") {
    return "- [x] Not applicable: this fixture section has no topic-owned behavior.";
  }
  if (mode === "unchecked" && heading === "## Added Features") {
    return "- [ ] Fixture behavior is covered by the topic module (`apps/web/src/localTopics/testTopic/index.ts`).";
  }
  if (mode === "missing-evidence" && heading === "## Added Features") {
    return "- [x] Fixture behavior is covered by the topic module.";
  }
  if (mode === "missing-evidence-path" && heading === "## Added Features") {
    return "- [x] Fixture behavior is covered by a stale topic module (`apps/web/src/localTopics/testTopic/missing.ts`).";
  }
  return `- [x] ${heading.slice("## Added ".length)} fixture behavior is covered by the topic module (\`apps/web/src/localTopics/testTopic/index.ts\`).`;
}

function readmeWithHeadings(
  omitHeading?: string,
  replayChecklistMode: ReplayChecklistFixtureMode = "valid",
): string {
  return [
    "# Test Topic",
    "",
    ...REQUIRED_TOPIC_README_HEADINGS.filter((heading) => heading !== omitHeading).flatMap(
      (heading) => [
        heading,
        REQUIRED_REPLAY_CHECKLIST_HEADINGS.includes(
          heading as (typeof REQUIRED_REPLAY_CHECKLIST_HEADINGS)[number],
        )
          ? replayChecklistLineForHeading(heading, replayChecklistMode)
          : "Test content.",
        "",
      ],
    ),
  ].join("\n");
}

function writeTopicFixture(
  root: string,
  options: {
    readonly omitReadme?: boolean;
    readonly omitHeading?: string;
    readonly pluginCommits?: ReadonlyArray<string>;
    readonly topicKind?: "code" | "mixed" | "test" | "docs";
    readonly componentStatus?: "pending" | "complete" | "not-applicable";
    readonly componentEntrypoints?: ReadonlyArray<string>;
    readonly omitEntrypointsOnDisk?: boolean;
    readonly verification?: ReadonlyArray<string>;
    readonly replayChecklistMode?: ReplayChecklistFixtureMode;
    readonly omitReplayContract?: boolean;
    readonly replayContractVerification?: ReadonlyArray<string>;
  } = {},
): void {
  const topicKind = options.topicKind ?? "code";
  const componentStatus = options.componentStatus ?? "complete";
  const componentEntrypoints =
    options.componentEntrypoints ??
    (componentStatus === "not-applicable" ? [] : ["apps/web/src/localTopics/testTopic/index.ts"]);
  writeJson(NodePath.join(root, LOCAL_TOPIC_MANIFEST_PATH), {
    schemaVersion: 1,
    topics: [
      {
        id: "test-topic",
        pluginPath: "local-plugins/test-topic",
        commits: ["1111111111111111111111111111111111111111"],
        subject: "feat(test): add test topic",
      },
    ],
  });

  const pluginDir = NodePath.join(root, "local-plugins", "test-topic");
  NodeFS.mkdirSync(pluginDir, { recursive: true });
  if (options.omitReadme !== true) {
    NodeFS.writeFileSync(
      NodePath.join(pluginDir, "README.md"),
      readmeWithHeadings(
        options.omitHeading,
        options.replayChecklistMode ?? (topicKind === "docs" ? "not-applicable" : "valid"),
      ),
    );
  }
  if (options.omitEntrypointsOnDisk !== true) {
    for (const entrypoint of componentEntrypoints) {
      const absoluteEntrypoint = NodePath.join(root, entrypoint);
      NodeFS.mkdirSync(NodePath.dirname(absoluteEntrypoint), { recursive: true });
      NodeFS.writeFileSync(absoluteEntrypoint, "export const testTopic = true;\n");
    }
  }
  writeJson(NodePath.join(pluginDir, "plugin.json"), {
    schemaVersion: 2,
    id: "test-topic",
    title: "Test Topic",
    topicKind,
    topicCommits: options.pluginCommits ?? ["1111111111111111111111111111111111111111"],
    ownedPaths: [{ path: "apps/web/src/test-topic.ts", role: "source" }],
    componentization: {
      status: componentStatus,
      entrypoints: componentEntrypoints.map((path) => ({
        path,
        kind: topicKind === "test" ? "test" : "source",
        publicSurface: topicKind === "test" ? "test" : "internal",
      })),
    },
    integrationPoints: [{ path: "apps/web/src/test-topic.ts", role: "thin-wiring" }],
    verification: options.verification ?? ["vp check", "vp run typecheck"],
    ...(options.omitReplayContract === true
      ? {}
      : {
          replayContract: {
            autonomy: "guarded-auto-repair",
            risk: "medium",
            intent: "Keep the test topic behavior available after upstream refactors.",
            preserve: ["The fixture topic module remains wired through the documented entrypoint."],
            safeAutoRepair: [
              "Move imports or thin wiring when upstream refactors the surrounding module.",
            ],
            stopForHuman: [
              "Stop when upstream removes the product surface that the fixture behavior depends on.",
            ],
            verification: options.replayContractVerification ?? ["vp check", "vp run typecheck"],
          },
        }),
  });
}

describe("local topic plugin validation", () => {
  it("derives repair scope from owned paths and integration points", () => {
    const plugin = {
      schemaVersion: 2 as const,
      id: "test-topic",
      title: "Test topic",
      topicKind: "code" as const,
      topicCommits: ["abc"],
      ownedPaths: [{ path: "apps/web/src/localTopics/testTopic", role: "source" as const }],
      componentization: { status: "complete" as const, entrypoints: [] },
      integrationPoints: [
        { path: "apps/web/src/components/ChatView.tsx", role: "thin-wiring" as const },
      ],
      verification: ["vp check"],
    };
    assert.deepEqual(localTopicRepairPaths(plugin), [
      "apps/web/src/localTopics/testTopic",
      "apps/web/src/components/ChatView.tsx",
    ]);
    assert.deepEqual(
      resolveTopicRepairPaths("/repo", plugin, ["abc"], (command, args, cwd) => ({
        command: [command, ...args].join(" "),
        cwd,
        exitCode: 0,
        stdout: "apps/server/src/topic-wiring.ts\napps/web/src/components/ChatView.tsx\n",
        stderr: "",
      })),
      [
        "apps/server/src/topic-wiring.ts",
        "apps/web/src/components/ChatView.tsx",
        "apps/web/src/localTopics/testTopic",
      ],
    );
  });

  it("parses the manifest", () => {
    const root = tempRoot();
    writeTopicFixture(root);

    const manifest = readLocalTopicManifest(root);

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.topics[0]?.id, "test-topic");
  });

  it("parses optional replay prerequisite and followup commits", () => {
    const root = tempRoot();
    writeTopicFixture(root);
    writeJson(NodePath.join(root, LOCAL_TOPIC_MANIFEST_PATH), {
      schemaVersion: 1,
      topics: [
        {
          id: "test-topic",
          pluginPath: "local-plugins/test-topic",
          replayPrerequisiteCommits: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
          commits: ["1111111111111111111111111111111111111111"],
          replayFollowupCommits: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          subject: "feat(test): add test topic",
        },
      ],
    });

    const manifest = readLocalTopicManifest(root);

    assert.deepStrictEqual(manifest.topics[0]?.prerequisiteCommits, [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    assert.deepStrictEqual(manifest.topics[0]?.commits, [
      "1111111111111111111111111111111111111111",
    ]);
    assert.deepStrictEqual(manifest.topics[0]?.followupCommits, [
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });
  it("accepts a complete plugin folder", () => {
    const root = tempRoot();
    writeTopicFixture(root);

    assert.deepStrictEqual(validateLocalTopicPlugins(root), {
      ok: true,
      errors: [],
    });
  });

  it("parses v2 plugin metadata", () => {
    const root = tempRoot();
    writeTopicFixture(root);

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, true);
  });

  it("fails when README.md is missing", () => {
    const root = tempRoot();
    writeTopicFixture(root, { omitReadme: true });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("README.md")));
  });

  it("fails when a required README section is missing", () => {
    const root = tempRoot();
    writeTopicFixture(root, { omitHeading: "## Replay Notes" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("## Replay Notes")));
  });

  it("fails when an Added section has no Replay Checklist Item", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayChecklistMode: "missing-item" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("Replay Checklist Item")));
  });

  it("fails when a Replay Checklist Item is unchecked", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayChecklistMode: "unchecked" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("must be checked")));
  });

  it("fails when a non-N/A Replay Checklist Item has no evidence", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayChecklistMode: "missing-evidence" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("backticked evidence")));
  });

  it("fails when Replay Checklist Item path evidence is stale", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayChecklistMode: "missing-evidence-path" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("evidence path does not exist")));
  });

  it("fails when a code topic has too few non-N/A Replay Checklist Items", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayChecklistMode: "too-few-non-na" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("non-N/A Replay Checklist Items")));
  });

  it("fails when plugin commits do not match manifest commits", () => {
    const root = tempRoot();
    writeTopicFixture(root, {
      pluginCommits: ["2222222222222222222222222222222222222222"],
    });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("topicCommits")));
  });

  it("fails when a code topic component entrypoint is missing", () => {
    const root = tempRoot();
    writeTopicFixture(root, { omitEntrypointsOnDisk: true });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("component entrypoint does not exist")));
  });

  it("accepts docs topics with not-applicable componentization", () => {
    const root = tempRoot();
    writeTopicFixture(root, {
      topicKind: "docs",
      componentStatus: "not-applicable",
      componentEntrypoints: [],
    });

    assert.deepStrictEqual(validateLocalTopicPlugins(root), {
      ok: true,
      errors: [],
    });
  });

  it("fails when componentization is pending in strict mode", () => {
    const root = tempRoot();
    writeTopicFixture(root, { componentStatus: "pending" });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("pending in strict mode")));
  });

  it("fails when verification commands are empty", () => {
    const root = tempRoot();
    writeTopicFixture(root, { verification: [] });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("verification")));
  });

  it("fails when replayContract is missing", () => {
    const root = tempRoot();
    writeTopicFixture(root, { omitReplayContract: true });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("replayContract")));
  });

  it("fails when replayContract verification is not listed in plugin verification", () => {
    const root = tempRoot();
    writeTopicFixture(root, { replayContractVerification: ["vp run missing-proof"] });

    const result = validateLocalTopicPlugins(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("missing-proof")));
  });

  it("rejects v1 metadata in strict mode but accepts it in permissive mode", () => {
    const root = tempRoot();
    writeTopicFixture(root);
    writeJson(NodePath.join(root, "local-plugins", "test-topic", "plugin.json"), {
      schemaVersion: 1,
      id: "test-topic",
      title: "Test Topic",
      topicCommits: ["1111111111111111111111111111111111111111"],
      ownedPaths: ["apps/web/src/test-topic.ts"],
      componentEntrypoints: ["apps/web/src/localTopics/testTopic/index.ts"],
      pendingComponentEntrypoints: ["apps/web/src/localTopics/testTopic/index.ts"],
      verification: ["vp check", "vp run typecheck"],
    });

    assert.equal(validateLocalTopicPlugins(root).ok, false);
    assert.equal(validateLocalTopicPlugins(root, { strict: false }).ok, true);
  });
});
