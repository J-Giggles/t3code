// @effect-diagnostics nodeBuiltinImport:off - Tests create temporary plugin metadata folders.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vitest";
import {
  LOCAL_TOPIC_MANIFEST_PATH,
  readLocalTopicManifest,
  REQUIRED_TOPIC_README_HEADINGS,
  validateLocalTopicPlugins,
} from "./local-topic-stack.ts";

function tempRoot(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "local-topic-stack-"));
}

function writeJson(path: string, value: unknown): void {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readmeWithHeadings(omitHeading?: string): string {
  return [
    "# Test Topic",
    "",
    ...REQUIRED_TOPIC_README_HEADINGS.filter((heading) => heading !== omitHeading).flatMap(
      (heading) => [heading, "Test content.", ""],
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
      readmeWithHeadings(options.omitHeading),
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
  });
}

describe("local topic plugin validation", () => {
  it("parses the manifest", () => {
    const root = tempRoot();
    writeTopicFixture(root);

    const manifest = readLocalTopicManifest(root);

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.topics[0]?.id, "test-topic");
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
