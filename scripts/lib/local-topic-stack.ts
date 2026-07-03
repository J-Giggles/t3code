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

export const REQUIRED_REPLAY_CHECKLIST_HEADINGS = [
  "## Added Features",
  "## Added UI",
  "## Added Server And Runtime Behavior",
  "## Added Tests",
] as const;

const MIN_NON_NA_REPLAY_CHECKLIST_ITEMS_BY_TOPIC_KIND: Record<LocalTopicKind, number> = {
  code: 4,
  mixed: 6,
  test: 2,
  docs: 0,
};

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

export type LocalTopicKind = "code" | "mixed" | "test" | "docs";
export type LocalTopicOwnedPathRole = "source" | "test" | "docs" | "config" | "script";
export type LocalTopicComponentStatus = "pending" | "complete" | "not-applicable";
export type LocalTopicComponentKind = "source" | "test" | "docs";
export type LocalTopicPublicSurface = "facade" | "internal" | "test";
export type LocalTopicIntegrationPointRole = "thin-wiring" | "public-facade" | "consumer";

export interface LocalTopicOwnedPath {
  readonly path: string;
  readonly role: LocalTopicOwnedPathRole;
}

export interface LocalTopicComponentEntrypoint {
  readonly path: string;
  readonly kind: LocalTopicComponentKind;
  readonly publicSurface: LocalTopicPublicSurface;
}

export interface LocalTopicComponentization {
  readonly status: LocalTopicComponentStatus;
  readonly entrypoints: ReadonlyArray<LocalTopicComponentEntrypoint>;
}

export interface LocalTopicIntegrationPoint {
  readonly path: string;
  readonly role: LocalTopicIntegrationPointRole;
}

export interface LocalTopicPluginV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly topicCommits: ReadonlyArray<string>;
  readonly ownedPaths: ReadonlyArray<string>;
  readonly componentEntrypoints: ReadonlyArray<string>;
  readonly pendingComponentEntrypoints?: ReadonlyArray<string>;
  readonly verification: ReadonlyArray<string>;
}

export interface LocalTopicPluginV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title: string;
  readonly topicKind: LocalTopicKind;
  readonly topicCommits: ReadonlyArray<string>;
  readonly ownedPaths: ReadonlyArray<LocalTopicOwnedPath>;
  readonly componentization: LocalTopicComponentization;
  readonly integrationPoints: ReadonlyArray<LocalTopicIntegrationPoint>;
  readonly verification: ReadonlyArray<string>;
}

export type LocalTopicPlugin = LocalTopicPluginV1 | LocalTopicPluginV2;

export interface ValidateLocalTopicPluginsOptions {
  readonly strict?: boolean;
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

function readManifestSchemaVersion(input: Record<string, unknown>, sourcePath: string): 1 {
  if (input.schemaVersion !== 1) {
    throw new Error(`${sourcePath} field "schemaVersion" must be 1.`);
  }
  return 1;
}

function readPluginSchemaVersion(input: Record<string, unknown>, sourcePath: string): 1 | 2 {
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    throw new Error(`${sourcePath} field "schemaVersion" must be 1 or 2.`);
  }
  return input.schemaVersion;
}

function readEnumField<const T extends string>(
  input: Record<string, unknown>,
  field: string,
  allowed: ReadonlyArray<T>,
  sourcePath: string,
): T {
  const value = input[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${sourcePath} field "${field}" must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function readObjectArrayField<T>(
  input: Record<string, unknown>,
  field: string,
  sourcePath: string,
  readEntry: (entry: Record<string, unknown>, index: number) => T,
): ReadonlyArray<T> {
  const value = input[field];
  if (!Array.isArray(value)) {
    throw new Error(`${sourcePath} field "${field}" must be an array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${sourcePath} field "${field}" entry ${index} must be an object.`);
    }
    return readEntry(entry as Record<string, unknown>, index);
  });
}

function parseManifestJson(raw: string, sourcePath: string): LocalTopicManifest {
  const input = parseJsonObject(raw, sourcePath);
  const topics = input.topics;
  if (!Array.isArray(topics)) {
    throw new Error(`${sourcePath} field "topics" must be an array.`);
  }

  return {
    schemaVersion: readManifestSchemaVersion(input, sourcePath),
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

function parsePluginJsonV1(input: Record<string, unknown>, sourcePath: string): LocalTopicPluginV1 {
  const pendingComponentEntrypoints = readOptionalStringArrayField(
    input,
    "pendingComponentEntrypoints",
    sourcePath,
  );

  return {
    schemaVersion: 1,
    id: readStringField(input, "id", sourcePath),
    title: readStringField(input, "title", sourcePath),
    topicCommits: readStringArrayField(input, "topicCommits", sourcePath),
    ownedPaths: readStringArrayField(input, "ownedPaths", sourcePath),
    componentEntrypoints: readStringArrayField(input, "componentEntrypoints", sourcePath),
    ...(pendingComponentEntrypoints === undefined ? {} : { pendingComponentEntrypoints }),
    verification: readStringArrayField(input, "verification", sourcePath),
  };
}

function readOwnedPathsV2(
  input: Record<string, unknown>,
  sourcePath: string,
): ReadonlyArray<LocalTopicOwnedPath> {
  return readObjectArrayField(input, "ownedPaths", sourcePath, (entry) => ({
    path: readStringField(entry, "path", sourcePath),
    role: readEnumField(entry, "role", ["source", "test", "docs", "config", "script"], sourcePath),
  }));
}

function readComponentizationV2(
  input: Record<string, unknown>,
  sourcePath: string,
): LocalTopicComponentization {
  const value = input.componentization;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${sourcePath} field "componentization" must be an object.`);
  }

  const componentization = value as Record<string, unknown>;
  return {
    status: readEnumField(
      componentization,
      "status",
      ["pending", "complete", "not-applicable"],
      sourcePath,
    ),
    entrypoints: readObjectArrayField(componentization, "entrypoints", sourcePath, (entry) => ({
      path: readStringField(entry, "path", sourcePath),
      kind: readEnumField(entry, "kind", ["source", "test", "docs"], sourcePath),
      publicSurface: readEnumField(
        entry,
        "publicSurface",
        ["facade", "internal", "test"],
        sourcePath,
      ),
    })),
  };
}

function readIntegrationPointsV2(
  input: Record<string, unknown>,
  sourcePath: string,
): ReadonlyArray<LocalTopicIntegrationPoint> {
  return readObjectArrayField(input, "integrationPoints", sourcePath, (entry) => ({
    path: readStringField(entry, "path", sourcePath),
    role: readEnumField(entry, "role", ["thin-wiring", "public-facade", "consumer"], sourcePath),
  }));
}

function parsePluginJsonV2(input: Record<string, unknown>, sourcePath: string): LocalTopicPluginV2 {
  return {
    schemaVersion: 2,
    id: readStringField(input, "id", sourcePath),
    title: readStringField(input, "title", sourcePath),
    topicKind: readEnumField(input, "topicKind", ["code", "mixed", "test", "docs"], sourcePath),
    topicCommits: readStringArrayField(input, "topicCommits", sourcePath),
    ownedPaths: readOwnedPathsV2(input, sourcePath),
    componentization: readComponentizationV2(input, sourcePath),
    integrationPoints: readIntegrationPointsV2(input, sourcePath),
    verification: readStringArrayField(input, "verification", sourcePath),
  };
}

function parsePluginJson(raw: string, sourcePath: string): LocalTopicPlugin {
  const input = parseJsonObject(raw, sourcePath);
  const schemaVersion = readPluginSchemaVersion(input, sourcePath);
  return schemaVersion === 1
    ? parsePluginJsonV1(input, sourcePath)
    : parsePluginJsonV2(input, sourcePath);
}

function readFileIfExists(path: string): string | undefined {
  return NodeFS.existsSync(path) ? NodeFS.readFileSync(path, "utf8") : undefined;
}

function hasReadmeHeading(readme: string, heading: string): boolean {
  return readme.split(/\r?\n/).some((line) => line.trim() === heading);
}

interface ReplayChecklistValidationResult {
  readonly errors: ReadonlyArray<string>;
  readonly nonNotApplicableItemCount: number;
}

function readReadmeSectionLines(readme: string, heading: string): ReadonlyArray<string> {
  const lines = readme.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) {
    return [];
  }

  const sectionLines: Array<string> = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines;
}

function readReplayChecklistItems(
  sectionLines: ReadonlyArray<string>,
): ReadonlyArray<{ readonly checked: boolean; readonly text: string }> {
  return sectionLines.flatMap((line) => {
    const match = /^\s*-\s+\[( |x|X)\]\s+(.+?)\s*$/u.exec(line);
    if (!match) {
      return [];
    }
    return [
      {
        checked: match[1] !== " ",
        text: match[2]!,
      },
    ];
  });
}

function readInlineCodeSpans(text: string): ReadonlyArray<string> {
  return Array.from(text.matchAll(/`([^`]+)`/gu), (match) => match[1]!.trim()).filter(
    (value) => value.length > 0,
  );
}

function looksLikeRepoPathEvidence(value: string): boolean {
  if (
    value.startsWith("/") ||
    value.startsWith("$") ||
    /^[A-Z][A-Z0-9_]*$/u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value) ||
    /\s/u.test(value) ||
    value.includes("*")
  ) {
    return false;
  }

  if (value.includes("/")) {
    return true;
  }

  return /\.(?:cjs|css|html|js|json|jsx|kt|md|mjs|scss|sh|sql|svg|swift|ts|tsx|toml|yaml|yml)$/u.test(
    value,
  );
}

function validateReplayChecklistEvidence(
  rootDir: string,
  topicId: string,
  heading: string,
  itemText: string,
): ReadonlyArray<string> {
  const errors: Array<string> = [];
  const evidenceSpans = readInlineCodeSpans(itemText);

  if (evidenceSpans.length === 0) {
    errors.push(
      `Plugin "${topicId}" README replay checklist item under "${heading}" must include backticked evidence.`,
    );
    return errors;
  }

  for (const evidence of evidenceSpans) {
    if (!looksLikeRepoPathEvidence(evidence)) {
      continue;
    }
    if (!NodeFS.existsSync(NodePath.join(rootDir, evidence))) {
      errors.push(
        `Plugin "${topicId}" README replay checklist evidence path does not exist: ${evidence}.`,
      );
    }
  }

  return errors;
}

function validateReadmeReplayChecklist(
  rootDir: string,
  topicId: string,
  topicKind: LocalTopicKind,
  readme: string,
): ReplayChecklistValidationResult {
  const errors: Array<string> = [];
  let nonNotApplicableItemCount = 0;

  for (const heading of REQUIRED_REPLAY_CHECKLIST_HEADINGS) {
    const sectionLines = readReadmeSectionLines(readme, heading);
    const items = readReplayChecklistItems(sectionLines);
    if (items.length === 0) {
      errors.push(
        `Plugin "${topicId}" README section "${heading}" must include at least one Replay Checklist Item.`,
      );
      continue;
    }

    for (const item of items) {
      if (!item.checked) {
        errors.push(
          `Plugin "${topicId}" README Replay Checklist Item under "${heading}" must be checked.`,
        );
      }

      if (item.text.startsWith("Not applicable:")) {
        continue;
      }

      nonNotApplicableItemCount++;
      errors.push(...validateReplayChecklistEvidence(rootDir, topicId, heading, item.text));
    }
  }

  const minimum = MIN_NON_NA_REPLAY_CHECKLIST_ITEMS_BY_TOPIC_KIND[topicKind];
  if (nonNotApplicableItemCount < minimum) {
    errors.push(
      `Plugin "${topicId}" README must include at least ${minimum} non-N/A Replay Checklist Items for ${topicKind} topics.`,
    );
  }

  return {
    errors,
    nonNotApplicableItemCount,
  };
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
  options: Required<ValidateLocalTopicPluginsOptions>,
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

  if (options.strict && plugin.schemaVersion !== 2) {
    errors.push(`Plugin "${topic.id}" plugin.json must use schemaVersion 2.`);
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

  if (plugin.schemaVersion === 1) {
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

  if (readme) {
    errors.push(
      ...validateReadmeReplayChecklist(rootDir, topic.id, plugin.topicKind, readme).errors,
    );
  }

  if (plugin.ownedPaths.length === 0) {
    errors.push(`Plugin "${topic.id}" must list ownedPaths.`);
  }

  if (plugin.integrationPoints.length === 0) {
    errors.push(`Plugin "${topic.id}" must list integrationPoints.`);
  }

  if (plugin.topicKind !== "docs" && plugin.componentization.status === "not-applicable") {
    errors.push(`Plugin "${topic.id}" componentization cannot be not-applicable.`);
  }

  if (plugin.topicKind === "docs" && plugin.componentization.status !== "not-applicable") {
    errors.push(`Plugin "${topic.id}" docs topic must use componentization.status not-applicable.`);
  }

  if (options.strict && plugin.componentization.status === "pending") {
    errors.push(`Plugin "${topic.id}" componentization.status must not be pending in strict mode.`);
  }

  const requiresEntrypoints =
    plugin.topicKind === "code" || plugin.topicKind === "mixed" || plugin.topicKind === "test";
  if (requiresEntrypoints && plugin.componentization.entrypoints.length === 0) {
    errors.push(
      `Plugin "${topic.id}" must list componentization entrypoints for ${plugin.topicKind} topics.`,
    );
  }

  for (const entrypoint of plugin.componentization.entrypoints) {
    if (entrypoint.path.trim().length === 0) {
      errors.push(`Plugin "${topic.id}" component entrypoint path must not be empty.`);
      continue;
    }
    if (!NodeFS.existsSync(NodePath.join(rootDir, entrypoint.path))) {
      errors.push(`Plugin "${topic.id}" component entrypoint does not exist: ${entrypoint.path}.`);
    }
  }

  return errors;
}

export function validateLocalTopicPlugins(
  rootDir: string,
  options: ValidateLocalTopicPluginsOptions = {},
): LocalTopicPluginValidationResult {
  const resolvedOptions: Required<ValidateLocalTopicPluginsOptions> = {
    strict: options.strict ?? true,
  };
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
    ...manifest.topics.flatMap((topic) => validatePluginFiles(rootDir, topic, resolvedOptions)),
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
