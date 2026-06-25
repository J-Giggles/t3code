import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import {
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
const PROJECT_READ_FILE_PATH_MAX_LENGTH = 512;
const PROJECT_AGENT_SECRET_REF_MAX_LENGTH = 128;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export const ProjectListEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type ProjectListEntriesInput = typeof ProjectListEntriesInput.Type;

export const ProjectListEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectListEntriesResult = typeof ProjectListEntriesResult.Type;

export const ProjectEntriesFailure = Schema.Literals([
  "workspace_root_not_found",
  "workspace_root_create_failed",
  "workspace_root_stat_failed",
  "workspace_root_not_directory",
  "search_index_create_failed",
  "search_index_scan_timed_out",
  "search_index_search_failed",
]);
export type ProjectEntriesFailure = typeof ProjectEntriesFailure.Type;

type ProjectEntriesFailureContext = {
  readonly failure: ProjectEntriesFailure;
  readonly normalizedCwd?: string;
  readonly timeout?: string;
  readonly detail?: string;
  readonly cause?: unknown;
};

function decodedProjectErrorMessage(props: object): string | undefined {
  if (!("message" in props)) return undefined;
  return typeof props.message === "string" ? props.message : undefined;
}

export class ProjectSearchEntriesError extends Schema.TaggedErrorClass<ProjectSearchEntriesError>()(
  "ProjectSearchEntriesError",
  {
    cwd: Schema.optional(TrimmedNonEmptyString),
    queryLength: Schema.optional(NonNegativeInt),
    limit: Schema.optional(PositiveInt),
    failure: Schema.optional(ProjectEntriesFailure),
    normalizedCwd: Schema.optional(TrimmedNonEmptyString),
    timeout: Schema.optional(TrimmedNonEmptyString),
    detail: Schema.optional(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  // The structured fields are optional on the wire so newer peers can decode legacy message-only
  // failures. New application code must provide them through this constructor.
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(
    props: ProjectEntriesFailureContext & {
      readonly cwd: string;
      readonly queryLength: number;
      readonly limit: number;
    },
  ) {
    super({
      ...props,
      message:
        decodedProjectErrorMessage(props) ??
        `Failed to search workspace entries in '${props.cwd}'.`,
    } as any);
  }
}

export class ProjectListEntriesError extends Schema.TaggedErrorClass<ProjectListEntriesError>()(
  "ProjectListEntriesError",
  {
    cwd: Schema.optional(TrimmedNonEmptyString),
    failure: Schema.optional(ProjectEntriesFailure),
    normalizedCwd: Schema.optional(TrimmedNonEmptyString),
    timeout: Schema.optional(TrimmedNonEmptyString),
    detail: Schema.optional(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: ProjectEntriesFailureContext & { readonly cwd: string }) {
    super({
      ...props,
      message:
        decodedProjectErrorMessage(props) ?? `Failed to list workspace entries in '${props.cwd}'.`,
    } as any);
  }
}

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_READ_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

export const ProjectReadFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  contents: Schema.String,
  byteLength: NonNegativeInt,
  truncated: Schema.Boolean,
});
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export const ProjectFileFailure = Schema.Literals([
  "workspace_path_outside_root",
  "resolved_path_outside_root",
  "path_not_file",
  "binary_file",
  "operation_failed",
]);
export type ProjectFileFailure = typeof ProjectFileFailure.Type;

export const ProjectFileOperation = Schema.Literals([
  "realpath-workspace-root",
  "realpath-target",
  "open",
  "stat",
  "read",
  "close",
  "make-directory",
  "write-file",
]);
export type ProjectFileOperation = typeof ProjectFileOperation.Type;

type ProjectFileFailureContext = {
  readonly cwd: string;
  readonly relativePath: string;
  readonly failure: ProjectFileFailure;
  readonly resolvedPath?: string;
  readonly resolvedWorkspaceRoot?: string;
  readonly operation?: ProjectFileOperation;
  readonly operationPath?: string;
  readonly cause?: unknown;
};

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    cwd: Schema.optional(TrimmedNonEmptyString),
    relativePath: Schema.optional(TrimmedNonEmptyString),
    failure: Schema.optional(ProjectFileFailure),
    resolvedPath: Schema.optional(TrimmedNonEmptyString),
    resolvedWorkspaceRoot: Schema.optional(TrimmedNonEmptyString),
    operation: Schema.optional(ProjectFileOperation),
    operationPath: Schema.optional(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: ProjectFileFailureContext) {
    super({
      ...props,
      message:
        decodedProjectErrorMessage(props) ??
        `Failed to read workspace file '${props.relativePath}' in '${props.cwd}'.`,
    } as any);
  }
}

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export class ProjectWriteFileError extends Schema.TaggedErrorClass<ProjectWriteFileError>()(
  "ProjectWriteFileError",
  {
    cwd: Schema.optional(TrimmedNonEmptyString),
    relativePath: Schema.optional(TrimmedNonEmptyString),
    failure: Schema.optional(ProjectFileFailure),
    resolvedPath: Schema.optional(TrimmedNonEmptyString),
    resolvedWorkspaceRoot: Schema.optional(TrimmedNonEmptyString),
    operation: Schema.optional(ProjectFileOperation),
    operationPath: Schema.optional(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: ProjectFileFailureContext) {
    super({
      ...props,
      message:
        decodedProjectErrorMessage(props) ??
        `Failed to write workspace file '${props.relativePath}' in '${props.cwd}'.`,
    } as any);
  }
}

export const ProjectAgentFileProvider = Schema.Literals([
  "codex",
  "opencode",
  "claude",
  "cursor",
  "copilot",
  "gemini",
  "windsurf",
  "devin",
  "t3",
]);
export type ProjectAgentFileProvider = typeof ProjectAgentFileProvider.Type;

export const ProjectAgentFileKind = Schema.Literals([
  "instructions",
  "provider-rule",
  "provider-settings",
  "mcp-config",
  "harness-manifest",
  "harness-context",
  "validation",
  "memory",
  "loop",
  "artifact",
  "template",
  "skill",
  "script",
  "other",
]);
export type ProjectAgentFileKind = typeof ProjectAgentFileKind.Type;

export const ProjectAgentFileStatus = Schema.Literals([
  "present",
  "missing",
  "invalid",
  "unreadable",
]);
export type ProjectAgentFileStatus = typeof ProjectAgentFileStatus.Type;

export const ProjectAgentFileDescriptor = Schema.Struct({
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_READ_FILE_PATH_MAX_LENGTH)),
  providers: Schema.Array(ProjectAgentFileProvider),
  kind: ProjectAgentFileKind,
  status: ProjectAgentFileStatus,
  autoLoaded: Schema.Boolean,
  recommended: Schema.Boolean,
  editable: Schema.Boolean,
  deletable: Schema.Boolean,
  description: TrimmedNonEmptyString,
  templateId: Schema.optional(TrimmedNonEmptyString),
  byteLength: Schema.optional(NonNegativeInt),
  updatedAt: Schema.optional(TrimmedNonEmptyString),
  warning: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectAgentFileDescriptor = typeof ProjectAgentFileDescriptor.Type;

export const ProjectAgentFilesListInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type ProjectAgentFilesListInput = typeof ProjectAgentFilesListInput.Type;

export const ProjectAgentMcpEnvSecretRef = Schema.Struct({
  secretRef: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_AGENT_SECRET_REF_MAX_LENGTH)),
});
export type ProjectAgentMcpEnvSecretRef = typeof ProjectAgentMcpEnvSecretRef.Type;

export const ProjectAgentMcpEnvValue = Schema.Union([TrimmedString, ProjectAgentMcpEnvSecretRef]);
export type ProjectAgentMcpEnvValue = typeof ProjectAgentMcpEnvValue.Type;

export const ProjectAgentMcpServer = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  command: TrimmedNonEmptyString,
  args: Schema.Array(TrimmedString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  env: Schema.optionalKey(Schema.Record(TrimmedNonEmptyString, ProjectAgentMcpEnvValue)),
});
export type ProjectAgentMcpServer = typeof ProjectAgentMcpServer.Type;

export const ProjectAgentToolAuth = Schema.Struct({
  env: Schema.optionalKey(Schema.Record(TrimmedNonEmptyString, ProjectAgentMcpEnvValue)),
  args: Schema.Array(TrimmedString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  configDir: Schema.optionalKey(TrimmedString),
});
export type ProjectAgentToolAuth = typeof ProjectAgentToolAuth.Type;

export const ProjectAgentHarnessManifest = Schema.Struct({
  version: Schema.Literal(1),
  canonicalInstructions: TrimmedNonEmptyString.pipe(
    Schema.withDecodingDefault(Effect.succeed("AGENTS.md")),
  ),
  mcpServers: Schema.Array(ProjectAgentMcpServer).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  memory: Schema.Struct({
    projectFacts: TrimmedNonEmptyString.pipe(
      Schema.withDecodingDefault(Effect.succeed(".agents/memory/project-facts.md")),
    ),
    knownDecisions: TrimmedNonEmptyString.pipe(
      Schema.withDecodingDefault(Effect.succeed(".agents/memory/known-decisions.md")),
    ),
    recurringIssues: TrimmedNonEmptyString.pipe(
      Schema.withDecodingDefault(Effect.succeed(".agents/memory/recurring-issues.md")),
    ),
  }).pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        projectFacts: ".agents/memory/project-facts.md",
        knownDecisions: ".agents/memory/known-decisions.md",
        recurringIssues: ".agents/memory/recurring-issues.md",
      }),
    ),
  ),
  validation: Schema.Struct({
    requiredCommands: Schema.Array(TrimmedString).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
    ),
  }).pipe(Schema.withDecodingDefault(Effect.succeed({ requiredCommands: [] }))),
  toolAuth: Schema.Record(TrimmedNonEmptyString, ProjectAgentToolAuth).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type ProjectAgentHarnessManifest = typeof ProjectAgentHarnessManifest.Type;

export const ProjectAgentSecretStatus = Schema.Struct({
  secretRef: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_AGENT_SECRET_REF_MAX_LENGTH)),
  configured: Schema.Boolean,
  projectKey: TrimmedNonEmptyString,
  mcpServerIds: Schema.Array(TrimmedNonEmptyString),
  toolIds: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type ProjectAgentSecretStatus = typeof ProjectAgentSecretStatus.Type;

export const ProjectAgentFilesListResult = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  files: Schema.Array(ProjectAgentFileDescriptor),
  manifest: Schema.optional(ProjectAgentHarnessManifest),
  secretStatuses: Schema.Array(ProjectAgentSecretStatus),
  warnings: Schema.Array(TrimmedNonEmptyString),
});
export type ProjectAgentFilesListResult = typeof ProjectAgentFilesListResult.Type;

export const ProjectAgentFileReadInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_READ_FILE_PATH_MAX_LENGTH)),
});
export type ProjectAgentFileReadInput = typeof ProjectAgentFileReadInput.Type;

export const ProjectAgentFileReadResult = Schema.Struct({
  file: ProjectAgentFileDescriptor,
  contents: Schema.String,
  byteLength: NonNegativeInt,
  truncated: Schema.Boolean,
});
export type ProjectAgentFileReadResult = typeof ProjectAgentFileReadResult.Type;

export const ProjectAgentFileWriteMode = Schema.Literals(["create", "update", "upsert"]);
export type ProjectAgentFileWriteMode = typeof ProjectAgentFileWriteMode.Type;

export const ProjectAgentFileWriteInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
  mode: ProjectAgentFileWriteMode,
});
export type ProjectAgentFileWriteInput = typeof ProjectAgentFileWriteInput.Type;

export const ProjectAgentFileWriteResult = Schema.Struct({
  file: ProjectAgentFileDescriptor,
});
export type ProjectAgentFileWriteResult = typeof ProjectAgentFileWriteResult.Type;

export const ProjectAgentFileDeleteInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectAgentFileDeleteInput = typeof ProjectAgentFileDeleteInput.Type;

export const ProjectAgentFileDeleteResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectAgentFileDeleteResult = typeof ProjectAgentFileDeleteResult.Type;

export const ProjectAgentSecretWriteInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  secretRef: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_AGENT_SECRET_REF_MAX_LENGTH)),
  value: Schema.String,
});
export type ProjectAgentSecretWriteInput = typeof ProjectAgentSecretWriteInput.Type;

export const ProjectAgentSecretDeleteInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  secretRef: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_AGENT_SECRET_REF_MAX_LENGTH)),
});
export type ProjectAgentSecretDeleteInput = typeof ProjectAgentSecretDeleteInput.Type;

export const ProjectAgentHarnessScaffoldInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type ProjectAgentHarnessScaffoldInput = typeof ProjectAgentHarnessScaffoldInput.Type;

export const ProjectAgentHarnessScaffoldResult = Schema.Struct({
  created: Schema.Array(TrimmedNonEmptyString),
  skipped: Schema.Array(TrimmedNonEmptyString),
  files: Schema.Array(ProjectAgentFileDescriptor),
  warnings: Schema.Array(TrimmedNonEmptyString),
});
export type ProjectAgentHarnessScaffoldResult = typeof ProjectAgentHarnessScaffoldResult.Type;

export class ProjectAgentFileOperationError extends Schema.TaggedErrorClass<ProjectAgentFileOperationError>()(
  "ProjectAgentFileOperationError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
