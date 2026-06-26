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
  } = {},
): void {
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
  writeJson(NodePath.join(pluginDir, "plugin.json"), {
    schemaVersion: 1,
    id: "test-topic",
    title: "Test Topic",
    topicCommits: options.pluginCommits ?? ["1111111111111111111111111111111111111111"],
    ownedPaths: ["apps/web/src/test-topic.ts"],
    componentEntrypoints: ["apps/web/src/localTopics/testTopic/index.ts"],
    pendingComponentEntrypoints: ["apps/web/src/localTopics/testTopic/index.ts"],
    verification: ["vp check", "vp run typecheck"],
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
});
