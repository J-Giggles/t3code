// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - This lightweight metadata checker must run without workspace dependencies installed.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const LOCAL_TOPIC_MANIFEST_PATH = "docs/operations/jordan-topic-stack.manifest.json";

export const REQUIRED_TOPIC_README_HEADINGS = [
  "## Purpose",
  "## Current Commits",
  "## Squash / Replay History",
  "## Added Features",
  "## Added UI",
  "## Added Server And Runtime Behavior",
  "## Added Tests",
  "## Component Entrypoints",
  "## Integration Points",
  "## Focused Implementation Snippets",
  "## Replay Notes",
  "## Verification",
  "## Known Follow-Up Work",
] as const;

export const REQUIRED_TOPIC_VERIFICATION_COMMANDS = ["vp check", "vp run typecheck"] as const;

export interface LocalTopicManifestTopic {
  readonly id: string;
  readonly pluginPath: string;
  readonly commits: ReadonlyArray<string>;
  readonly subject: string;
}

export interface LocalTopicManifest {
  readonly schemaVersion: 1;
  readonly topics: ReadonlyArray<LocalTopicManifestTopic>;
}

export interface LocalTopicPlugin {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly topicCommits: ReadonlyArray<string>;
  readonly ownedPaths: ReadonlyArray<string>;
  readonly componentEntrypoints: ReadonlyArray<string>;
  readonly pendingComponentEntrypoints?: ReadonlyArray<string>;
  readonly verification: ReadonlyArray<string>;
}

export interface LocalTopicPluginValidationResult {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<string>;
}

export function readLocalTopicManifest(rootDir: string): LocalTopicManifest {
  const manifestPath = NodePath.join(rootDir, LOCAL_TOPIC_MANIFEST_PATH);
  return parseManifestJson(NodeFS.readFileSync(manifestPath, "utf8"), manifestPath);
}

export function readLocalTopicPlugin(rootDir: string, pluginPath: string): LocalTopicPlugin {
  const pluginJsonPath = NodePath.join(rootDir, pluginPath, "plugin.json");
  return parsePluginJson(NodeFS.readFileSync(pluginJsonPath, "utf8"), pluginJsonPath);
}

function parseJsonObject(raw: string, sourcePath: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${sourcePath} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function readStringField(
  input: Record<string, unknown>,
  field: string,
  sourcePath: string,
): string {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${sourcePath} field "${field}" must be a non-empty string.`);
  }
  return value;
}

function readStringArrayField(
  input: Record<string, unknown>,
  field: string,
  sourcePath: string,
): ReadonlyArray<string> {
  const value = input[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${sourcePath} field "${field}" must be an array of strings.`);
  }
  return value as ReadonlyArray<string>;
}

function readOptionalStringArrayField(
  input: Record<string, unknown>,
  field: string,
  sourcePath: string,
): ReadonlyArray<string> | undefined {
  if (!(field in input)) {
    return undefined;
  }
  return readStringArrayField(input, field, sourcePath);
}

function readSchemaVersion(input: Record<string, unknown>, sourcePath: string): 1 {
  if (input.schemaVersion !== 1) {
    throw new Error(`${sourcePath} field "schemaVersion" must be 1.`);
  }
  return 1;
}

function parseManifestJson(raw: string, sourcePath: string): LocalTopicManifest {
  const input = parseJsonObject(raw, sourcePath);
  const topics = input.topics;
  if (!Array.isArray(topics)) {
    throw new Error(`${sourcePath} field "topics" must be an array.`);
  }

  return {
    schemaVersion: readSchemaVersion(input, sourcePath),
    topics: topics.map((topic, index) => {
      if (typeof topic !== "object" || topic === null || Array.isArray(topic)) {
        throw new Error(`${sourcePath} topic at index ${index} must be an object.`);
      }
      const topicRecord = topic as Record<string, unknown>;
      return {
        id: readStringField(topicRecord, "id", sourcePath),
        pluginPath: readStringField(topicRecord, "pluginPath", sourcePath),
        commits: readStringArrayField(topicRecord, "commits", sourcePath),
        subject: readStringField(topicRecord, "subject", sourcePath),
      };
    }),
  };
}

function parsePluginJson(raw: string, sourcePath: string): LocalTopicPlugin {
  const input = parseJsonObject(raw, sourcePath);
  const pendingComponentEntrypoints = readOptionalStringArrayField(
    input,
    "pendingComponentEntrypoints",
    sourcePath,
  );

  return {
    schemaVersion: readSchemaVersion(input, sourcePath),
    id: readStringField(input, "id", sourcePath),
    title: readStringField(input, "title", sourcePath),
    topicCommits: readStringArrayField(input, "topicCommits", sourcePath),
    ownedPaths: readStringArrayField(input, "ownedPaths", sourcePath),
    componentEntrypoints: readStringArrayField(input, "componentEntrypoints", sourcePath),
    ...(pendingComponentEntrypoints === undefined ? {} : { pendingComponentEntrypoints }),
    verification: readStringArrayField(input, "verification", sourcePath),
  };
}

function readFileIfExists(path: string): string | undefined {
  return NodeFS.existsSync(path) ? NodeFS.readFileSync(path, "utf8") : undefined;
}

function hasReadmeHeading(readme: string, heading: string): boolean {
  return readme.split(/\r?\n/).some((line) => line.trim() === heading);
}

function validateManifest(manifest: LocalTopicManifest): ReadonlyArray<string> {
  const errors: Array<string> = [];
  const seenIds = new Set<string>();
  const seenPluginPaths = new Set<string>();

  for (const topic of manifest.topics) {
    if (seenIds.has(topic.id)) {
      errors.push(`Manifest topic id "${topic.id}" is duplicated.`);
    }
    seenIds.add(topic.id);

    if (seenPluginPaths.has(topic.pluginPath)) {
      errors.push(`Manifest pluginPath "${topic.pluginPath}" is used by more than one topic.`);
    }
    seenPluginPaths.add(topic.pluginPath);

    if (!topic.pluginPath.startsWith("local-plugins/")) {
      errors.push(`Manifest topic "${topic.id}" pluginPath must live under local-plugins/.`);
    }

    if (topic.commits.length === 0) {
      errors.push(`Manifest topic "${topic.id}" must list at least one commit.`);
    }
  }

  return errors;
}

function validatePluginFiles(
  rootDir: string,
  topic: LocalTopicManifestTopic,
): ReadonlyArray<string> {
  const errors: Array<string> = [];
  const pluginDir = NodePath.join(rootDir, topic.pluginPath);
  const readmePath = NodePath.join(pluginDir, "README.md");
  const pluginJsonPath = NodePath.join(pluginDir, "plugin.json");

  if (!NodeFS.existsSync(pluginDir)) {
    return [`Manifest topic "${topic.id}" is missing plugin folder ${topic.pluginPath}.`];
  }

  const readme = readFileIfExists(readmePath);
  if (!readme) {
    errors.push(`Plugin "${topic.id}" is missing ${topic.pluginPath}/README.md.`);
  } else {
    for (const heading of REQUIRED_TOPIC_README_HEADINGS) {
      if (!hasReadmeHeading(readme, heading)) {
        errors.push(`Plugin "${topic.id}" README is missing required heading "${heading}".`);
      }
    }
  }

  if (!NodeFS.existsSync(pluginJsonPath)) {
    errors.push(`Plugin "${topic.id}" is missing ${topic.pluginPath}/plugin.json.`);
    return errors;
  }

  let plugin: LocalTopicPlugin;
  try {
    plugin = readLocalTopicPlugin(rootDir, topic.pluginPath);
  } catch (error) {
    errors.push(
      `Plugin "${topic.id}" plugin.json could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return errors;
  }

  if (plugin.id !== topic.id) {
    errors.push(`Plugin "${topic.id}" plugin.json id is "${plugin.id}".`);
  }

  if (JSON.stringify(plugin.topicCommits) !== JSON.stringify(topic.commits)) {
    errors.push(`Plugin "${topic.id}" topicCommits do not match the manifest commits.`);
  }

  if (plugin.verification.length === 0) {
    errors.push(`Plugin "${topic.id}" must list verification commands.`);
  }

  for (const requiredCommand of REQUIRED_TOPIC_VERIFICATION_COMMANDS) {
    if (!plugin.verification.includes(requiredCommand)) {
      errors.push(`Plugin "${topic.id}" verification must include "${requiredCommand}".`);
    }
  }

  const pendingEntrypoints = new Set(plugin.pendingComponentEntrypoints ?? []);
  if (plugin.componentEntrypoints.length === 0 && pendingEntrypoints.size === 0) {
    errors.push(
      `Plugin "${topic.id}" must list componentEntrypoints or pendingComponentEntrypoints.`,
    );
  }

  for (const entrypoint of plugin.componentEntrypoints) {
    const absoluteEntrypoint = NodePath.join(rootDir, entrypoint);
    if (!NodeFS.existsSync(absoluteEntrypoint) && !pendingEntrypoints.has(entrypoint)) {
      errors.push(`Plugin "${topic.id}" component entrypoint does not exist: ${entrypoint}.`);
    }
  }

  return errors;
}

export function validateLocalTopicPlugins(rootDir: string): LocalTopicPluginValidationResult {
  let manifest: LocalTopicManifest;
  try {
    manifest = readLocalTopicManifest(rootDir);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Could not read ${LOCAL_TOPIC_MANIFEST_PATH}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }

  const errors = [
    ...validateManifest(manifest),
    ...manifest.topics.flatMap((topic) => validatePluginFiles(rootDir, topic)),
  ];

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function formatLocalTopicPluginValidationResult(
  result: LocalTopicPluginValidationResult,
): string {
  if (result.ok) {
    return "Local topic plugin validation passed.\n";
  }

  return [
    "Local topic plugin validation failed:",
    ...result.errors.map((error) => `- ${error}`),
    "",
  ].join("\n");
}
