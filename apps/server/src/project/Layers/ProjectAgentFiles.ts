// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";

import type {
  ProjectAgentFileDescriptor,
  ProjectAgentFileKind,
  ProjectAgentFileProvider,
  ProjectAgentHarnessManifest,
  ProjectAgentMcpEnvSecretRef,
  ProjectAgentSecretStatus,
} from "@t3tools/contracts";
import {
  ProjectAgentFileOperationError,
  ProjectAgentHarnessManifest as ProjectAgentHarnessManifestSchema,
} from "@t3tools/contracts";
import {
  AGENT_FILE_TEMPLATES,
  classifyAgentFilePath,
  getAgentFileTemplate,
  getRecommendedAgentFileTemplates,
  normalizeAgentFilePath,
  type AgentFileClassification,
} from "@t3tools/shared/agentFiles";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { ServerSecretStore } from "../../auth/ServerSecretStore.ts";
import { WorkspaceFileSystem } from "../../workspace/Services/WorkspaceFileSystem.ts";
import { WorkspacePaths } from "../../workspace/Services/WorkspacePaths.ts";
import { WorkspaceEntries } from "../../workspace/WorkspaceEntries.ts";
import { RepositoryIdentityResolver } from "../RepositoryIdentityResolver.ts";
import { ProjectAgentFiles, type ProjectAgentFilesShape } from "../Services/ProjectAgentFiles.ts";
import {
  projectAgentProjectKeyFromSource,
  projectAgentSecretStorageKey,
} from "../projectAgentSecretKeys.ts";

const HARNESS_MANIFEST_RELATIVE_PATH = ".agents/harness.json";
const MAX_AGENT_FILE_SCAN_ENTRIES = 25_000;
const AGENT_FILE_SCAN_SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function isSecretRefValue(value: unknown): value is ProjectAgentMcpEnvSecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "secretRef" in value &&
    typeof (value as { readonly secretRef?: unknown }).secretRef === "string"
  );
}

function toOperationError(message: string, cause?: unknown): ProjectAgentFileOperationError {
  return new ProjectAgentFileOperationError({
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function descriptorFromClassification(input: {
  readonly relativePath: string;
  readonly classification: AgentFileClassification;
  readonly status: ProjectAgentFileDescriptor["status"];
  readonly byteLength?: number;
  readonly updatedAt?: string;
  readonly warning?: string;
}): ProjectAgentFileDescriptor {
  const normalized = normalizeAgentFilePath(input.relativePath);
  return {
    relativePath: normalized,
    providers: [...input.classification.providers] as ProjectAgentFileProvider[],
    kind: input.classification.kind as ProjectAgentFileKind,
    status: input.status,
    autoLoaded: input.classification.autoLoaded,
    recommended: input.classification.recommended,
    editable: input.classification.editable,
    deletable: normalized.toLowerCase() === "agents.md" ? false : input.classification.deletable,
    description: input.classification.description,
    ...(input.classification.templateId ? { templateId: input.classification.templateId } : {}),
    ...(input.byteLength !== undefined ? { byteLength: input.byteLength } : {}),
    ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
    ...(input.warning !== undefined ? { warning: input.warning } : {}),
  };
}

function formatSchemaError(error: unknown): string {
  if (error && typeof error === "object" && "issue" in error) {
    return SchemaIssue.makeFormatterDefault()((error as { readonly issue: never }).issue);
  }
  return error instanceof Error ? error.message : String(error);
}

function extractSecretRefs(
  manifest: ProjectAgentHarnessManifest | undefined,
): ReadonlyMap<
  string,
  { readonly mcpServerIds: readonly string[]; readonly toolIds: readonly string[] }
> {
  const refs = new Map<
    string,
    { readonly mcpServerIds: Set<string>; readonly toolIds: Set<string> }
  >();
  for (const server of manifest?.mcpServers ?? []) {
    for (const value of Object.values(server.env ?? {})) {
      if (!isSecretRefValue(value)) continue;
      const secretRef = value.secretRef.trim();
      if (!secretRef) continue;
      const current = refs.get(secretRef) ?? {
        mcpServerIds: new Set<string>(),
        toolIds: new Set<string>(),
      };
      current.mcpServerIds.add(server.id);
      refs.set(secretRef, current);
    }
  }
  for (const [toolId, toolAuth] of Object.entries(manifest?.toolAuth ?? {})) {
    for (const value of Object.values(toolAuth.env ?? {})) {
      if (!isSecretRefValue(value)) continue;
      const secretRef = value.secretRef.trim();
      if (!secretRef) continue;
      const current = refs.get(secretRef) ?? {
        mcpServerIds: new Set<string>(),
        toolIds: new Set<string>(),
      };
      current.toolIds.add(toolId);
      refs.set(secretRef, current);
    }
  }
  return new Map(
    [...refs.entries()].map(([secretRef, usage]) => [
      secretRef,
      {
        mcpServerIds: [...usage.mcpServerIds].toSorted((left, right) => left.localeCompare(right)),
        toolIds: [...usage.toolIds].toSorted((left, right) => left.localeCompare(right)),
      },
    ]),
  );
}

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ProjectAgentHarnessManifestSchema),
);

const makeProjectAgentFiles = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* WorkspaceEntries;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceFileSystem = yield* WorkspaceFileSystem;
  const repositoryIdentityResolver = yield* RepositoryIdentityResolver;
  const secretStore = yield* ServerSecretStore;

  const normalizeCwd = (cwd: string) =>
    workspacePaths
      .normalizeWorkspaceRoot(cwd)
      .pipe(Effect.mapError((cause) => toOperationError(cause.message, cause)));

  const resolveRelativePath = (cwd: string, relativePath: string) =>
    workspacePaths
      .resolveRelativePathWithinRoot({ workspaceRoot: cwd, relativePath })
      .pipe(Effect.mapError((cause) => toOperationError(cause.message, cause)));

  const resolveProjectKey = Effect.fn("ProjectAgentFiles.resolveProjectKey")(function* (
    cwd: string,
  ) {
    const normalizedCwd = yield* normalizeCwd(cwd);
    const repositoryIdentity = yield* repositoryIdentityResolver.resolve(normalizedCwd);
    return projectAgentProjectKeyFromSource({
      source: repositoryIdentity?.canonicalKey ?? normalizedCwd,
      sourceKind: repositoryIdentity ? "repository" : "path",
    });
  });

  const readHarnessManifest = Effect.fn("ProjectAgentFiles.readHarnessManifest")(function* (
    cwd: string,
  ): Effect.fn.Return<
    {
      readonly manifest?: ProjectAgentHarnessManifest;
      readonly warnings: readonly string[];
      readonly descriptorWarning?: string;
    },
    never
  > {
    const target = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: cwd,
        relativePath: HARNESS_MANIFEST_RELATIVE_PATH,
      })
      .pipe(Effect.orDie);
    const exists = yield* fileSystem
      .exists(target.absolutePath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return { warnings: [] };

    const raw = yield* fileSystem.readFileString(target.absolutePath).pipe(
      Effect.mapError(
        (cause) => `Unable to read ${HARNESS_MANIFEST_RELATIVE_PATH}: ${cause.message}`,
      ),
      Effect.result,
    );
    if (Result.isFailure(raw)) {
      return { warnings: [raw.failure], descriptorWarning: raw.failure };
    }

    const manifest = yield* decodeManifest(raw.success).pipe(
      Effect.mapError((cause) => formatSchemaError(cause)),
      Effect.result,
    );
    if (Result.isFailure(manifest)) {
      const warning = `Invalid ${HARNESS_MANIFEST_RELATIVE_PATH}: ${manifest.failure}`;
      return { warnings: [warning], descriptorWarning: warning };
    }
    return { manifest: manifest.success, warnings: [] };
  });

  const metadataForPath = Effect.fn("ProjectAgentFiles.metadataForPath")(function* (
    cwd: string,
    relativePath: string,
  ) {
    const target = yield* resolveRelativePath(cwd, relativePath);
    return yield* Effect.tryPromise({
      try: async () => {
        const stat = await NodeFSP.stat(target.absolutePath);
        return { byteLength: stat.size, updatedAt: stat.mtime.toISOString() };
      },
      catch: (cause) =>
        toOperationError(
          `Unable to stat ${relativePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        ),
    }).pipe(Effect.result);
  });

  const descriptorForPresentPath = Effect.fn("ProjectAgentFiles.descriptorForPresentPath")(
    function* (cwd: string, relativePath: string, descriptorWarning?: string) {
      const normalized = normalizeAgentFilePath(relativePath);
      const classification = classifyAgentFilePath(normalized);
      if (!classification) return null;
      const metadata = yield* metadataForPath(cwd, normalized);
      if (Result.isFailure(metadata)) {
        return descriptorFromClassification({
          relativePath: normalized,
          classification,
          status: "unreadable",
          warning: metadata.failure.message,
        });
      }
      return descriptorFromClassification({
        relativePath: normalized,
        classification,
        status:
          normalized === HARNESS_MANIFEST_RELATIVE_PATH && descriptorWarning
            ? "invalid"
            : "present",
        byteLength: metadata.success.byteLength,
        updatedAt: metadata.success.updatedAt,
        ...(descriptorWarning ? { warning: descriptorWarning } : {}),
      });
    },
  );

  const descriptorForRecognizedPath = Effect.fn("ProjectAgentFiles.descriptorForRecognizedPath")(
    function* (cwd: string, relativePath: string) {
      const normalized = normalizeAgentFilePath(relativePath);
      const descriptor = yield* descriptorForPresentPath(cwd, normalized);
      if (!descriptor) {
        return yield* toOperationError(`Path is not a recognized agent file: ${normalized}`);
      }
      return descriptor;
    },
  );

  const pathExists = Effect.fn("ProjectAgentFiles.pathExists")(function* (
    cwd: string,
    relativePath: string,
  ) {
    const target = yield* resolveRelativePath(cwd, relativePath);
    return yield* fileSystem.exists(target.absolutePath).pipe(Effect.orElseSucceed(() => false));
  });

  const scanAgentFilePaths = Effect.fn("ProjectAgentFiles.scanAgentFilePaths")(function* (
    cwd: string,
  ) {
    return yield* Effect.tryPromise({
      try: async () => {
        const discovered = new Set<string>();
        let visited = 0;
        async function scanDirectory(
          absoluteDirectory: string,
          relativeDirectory: string,
        ): Promise<void> {
          if (visited >= MAX_AGENT_FILE_SCAN_ENTRIES) return;
          const dirents = await NodeFSP.readdir(absoluteDirectory, { withFileTypes: true });
          for (const dirent of dirents) {
            if (visited >= MAX_AGENT_FILE_SCAN_ENTRIES) return;
            visited += 1;
            const relativePath = relativeDirectory
              ? `${relativeDirectory}/${dirent.name}`
              : dirent.name;
            if (dirent.isDirectory()) {
              if (AGENT_FILE_SCAN_SKIP_DIRECTORIES.has(dirent.name)) continue;
              await scanDirectory(path.join(absoluteDirectory, dirent.name), relativePath);
              continue;
            }
            if (!dirent.isFile()) continue;
            const normalized = normalizeAgentFilePath(relativePath);
            if (classifyAgentFilePath(normalized)) discovered.add(normalized);
          }
        }
        await scanDirectory(cwd, "");
        return [...discovered];
      },
      catch: (cause) =>
        toOperationError(
          `Failed to scan project agent files: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        ),
    });
  });

  const buildSecretStatuses = Effect.fn("ProjectAgentFiles.buildSecretStatuses")(function* (input: {
    readonly cwd: string;
    readonly manifest?: ProjectAgentHarnessManifest;
  }) {
    const projectKey = yield* resolveProjectKey(input.cwd);
    const statuses: ProjectAgentSecretStatus[] = [];
    for (const [secretRef, usage] of extractSecretRefs(input.manifest)) {
      const stored = yield* secretStore
        .get(projectAgentSecretStorageKey({ projectKey, secretRef }))
        .pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
      statuses.push({
        secretRef,
        configured: Option.isSome(stored),
        projectKey,
        mcpServerIds: [...usage.mcpServerIds],
        toolIds: [...usage.toolIds],
      });
    }
    return statuses.toSorted((left, right) => left.secretRef.localeCompare(right.secretRef));
  });

  const list: ProjectAgentFilesShape["list"] = Effect.fn("ProjectAgentFiles.list")(
    function* (input) {
      const cwd = yield* normalizeCwd(input.cwd);
      const manifestResult = yield* readHarnessManifest(cwd);
      const listed = yield* entries
        .list({ cwd })
        .pipe(
          Effect.mapError((cause) =>
            toOperationError(`Failed to list workspace entries: ${cause.message}`, cause),
          ),
        );
      const presentAgentPaths = new Set<string>();
      for (const entry of listed.entries) {
        if (entry.kind !== "file") continue;
        const normalized = normalizeAgentFilePath(entry.path);
        if (classifyAgentFilePath(normalized)) presentAgentPaths.add(normalized);
      }
      for (const relativePath of yield* scanAgentFilePaths(cwd)) {
        presentAgentPaths.add(relativePath);
      }

      const presentDescriptors: ProjectAgentFileDescriptor[] = [];
      for (const relativePath of presentAgentPaths) {
        const descriptor = yield* descriptorForPresentPath(
          cwd,
          relativePath,
          relativePath === HARNESS_MANIFEST_RELATIVE_PATH
            ? manifestResult.descriptorWarning
            : undefined,
        );
        if (descriptor) presentDescriptors.push(descriptor);
      }

      const presentPathKeys = new Set(
        presentDescriptors.map((file) => file.relativePath.toLowerCase()),
      );
      const missingDescriptors = getRecommendedAgentFileTemplates()
        .filter(
          (template) =>
            !presentPathKeys.has(normalizeAgentFilePath(template.relativePath).toLowerCase()),
        )
        .map((template) =>
          descriptorFromClassification({
            relativePath: template.relativePath,
            classification: template,
            status: "missing",
          }),
        );

      const secretStatuses = yield* buildSecretStatuses({
        cwd,
        ...(manifestResult.manifest ? { manifest: manifestResult.manifest } : {}),
      });
      return {
        cwd,
        files: [...presentDescriptors, ...missingDescriptors].toSorted((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        ),
        ...(manifestResult.manifest ? { manifest: manifestResult.manifest } : {}),
        secretStatuses,
        warnings: [...manifestResult.warnings],
      };
    },
  );

  const read: ProjectAgentFilesShape["read"] = Effect.fn("ProjectAgentFiles.read")(
    function* (input) {
      const cwd = yield* normalizeCwd(input.cwd);
      const file = yield* descriptorForRecognizedPath(cwd, input.relativePath);
      const result = yield* workspaceFileSystem
        .readFile({ cwd, relativePath: file.relativePath })
        .pipe(
          Effect.mapError((cause) =>
            toOperationError(
              "detail" in cause ? `Failed to read agent file: ${cause.detail}` : cause.message,
              cause,
            ),
          ),
        );
      return {
        file: { ...file, byteLength: result.byteLength },
        contents: result.contents,
        byteLength: result.byteLength,
        truncated: result.truncated,
      };
    },
  );

  const write: ProjectAgentFilesShape["write"] = Effect.fn("ProjectAgentFiles.write")(
    function* (input) {
      const cwd = yield* normalizeCwd(input.cwd);
      const normalized = normalizeAgentFilePath(input.relativePath);
      if (!classifyAgentFilePath(normalized)) {
        return yield* toOperationError(`Path is not a recognized agent file: ${normalized}`);
      }
      const exists = yield* pathExists(cwd, normalized);
      if (input.mode === "create" && exists) {
        return yield* toOperationError(`Agent file already exists: ${normalized}`);
      }
      if (input.mode === "update" && !exists) {
        return yield* toOperationError(`Agent file does not exist: ${normalized}`);
      }
      yield* workspaceFileSystem
        .writeFile({ cwd, relativePath: normalized, contents: input.contents })
        .pipe(
          Effect.mapError((cause) =>
            toOperationError(
              "detail" in cause ? `Failed to write agent file: ${cause.detail}` : cause.message,
              cause,
            ),
          ),
        );
      const file = yield* descriptorForRecognizedPath(cwd, normalized);
      return { file };
    },
  );

  const deleteFile: ProjectAgentFilesShape["delete"] = Effect.fn("ProjectAgentFiles.delete")(
    function* (input) {
      const cwd = yield* normalizeCwd(input.cwd);
      const file = yield* descriptorForRecognizedPath(cwd, input.relativePath);
      if (!file.deletable) {
        return yield* toOperationError(`Agent file cannot be deleted: ${file.relativePath}`);
      }
      return yield* workspaceFileSystem
        .deleteFile({ cwd, relativePath: file.relativePath })
        .pipe(
          Effect.mapError((cause) =>
            toOperationError(
              "detail" in cause ? `Failed to delete agent file: ${cause.detail}` : cause.message,
              cause,
            ),
          ),
        );
    },
  );

  const scaffoldHarness: ProjectAgentFilesShape["scaffoldHarness"] = Effect.fn(
    "ProjectAgentFiles.scaffoldHarness",
  )(function* (input) {
    const cwd = yield* normalizeCwd(input.cwd);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const template of AGENT_FILE_TEMPLATES) {
      const relativePath = normalizeAgentFilePath(template.relativePath);
      if (!relativePath.startsWith(".agents/")) continue;
      if (yield* pathExists(cwd, relativePath)) {
        skipped.push(relativePath);
        continue;
      }
      yield* workspaceFileSystem
        .writeFile({
          cwd,
          relativePath,
          contents: getAgentFileTemplate(template.templateId)?.contents ?? template.contents,
        })
        .pipe(
          Effect.mapError((cause) =>
            toOperationError(
              "detail" in cause ? `Failed to scaffold agent file: ${cause.detail}` : cause.message,
              cause,
            ),
          ),
        );
      created.push(relativePath);
    }
    const result = yield* list({ cwd });
    return { created, skipped, files: result.files, warnings: result.warnings };
  });

  const statusForSecret = Effect.fn("ProjectAgentFiles.statusForSecret")(function* (input: {
    readonly cwd: string;
    readonly secretRef: string;
  }) {
    const cwd = yield* normalizeCwd(input.cwd);
    const projectKey = yield* resolveProjectKey(cwd);
    const manifest = yield* readHarnessManifest(cwd);
    const usage = extractSecretRefs(manifest.manifest).get(input.secretRef);
    const stored = yield* secretStore
      .get(projectAgentSecretStorageKey({ projectKey, secretRef: input.secretRef }))
      .pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
    return {
      secretRef: input.secretRef,
      configured: Option.isSome(stored),
      projectKey,
      mcpServerIds: [...(usage?.mcpServerIds ?? [])],
      toolIds: [...(usage?.toolIds ?? [])],
    } satisfies ProjectAgentSecretStatus;
  });

  const writeSecret: ProjectAgentFilesShape["writeSecret"] = Effect.fn(
    "ProjectAgentFiles.writeSecret",
  )(function* (input) {
    const cwd = yield* normalizeCwd(input.cwd);
    const projectKey = yield* resolveProjectKey(cwd);
    yield* secretStore
      .set(
        projectAgentSecretStorageKey({ projectKey, secretRef: input.secretRef }),
        new TextEncoder().encode(input.value),
      )
      .pipe(
        Effect.mapError((cause) =>
          toOperationError(`Failed to write project agent secret: ${cause.message}`, cause),
        ),
      );
    return yield* statusForSecret({ cwd, secretRef: input.secretRef });
  });

  const deleteSecret: ProjectAgentFilesShape["deleteSecret"] = Effect.fn(
    "ProjectAgentFiles.deleteSecret",
  )(function* (input) {
    const cwd = yield* normalizeCwd(input.cwd);
    const projectKey = yield* resolveProjectKey(cwd);
    yield* secretStore
      .remove(projectAgentSecretStorageKey({ projectKey, secretRef: input.secretRef }))
      .pipe(
        Effect.mapError((cause) =>
          toOperationError(`Failed to delete project agent secret: ${cause.message}`, cause),
        ),
      );
    return yield* statusForSecret({ cwd, secretRef: input.secretRef });
  });

  return {
    delete: deleteFile,
    deleteSecret,
    list,
    read,
    scaffoldHarness,
    write,
    writeSecret,
  } satisfies ProjectAgentFilesShape;
});

export const ProjectAgentFilesLive = Layer.effect(ProjectAgentFiles, makeProjectAgentFiles);
