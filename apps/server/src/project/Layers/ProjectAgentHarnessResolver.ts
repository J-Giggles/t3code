import type {
  ProjectAgentHarnessManifest,
  ProjectAgentMcpEnvSecretRef,
  ProjectAgentSecretStatus,
} from "@t3tools/contracts";
import { ProjectAgentHarnessManifest as ProjectAgentHarnessManifestSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { ServerSecretStore } from "../../auth/ServerSecretStore.ts";
import type * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import { WorkspacePaths } from "../../workspace/Services/WorkspacePaths.ts";
import { RepositoryIdentityResolver } from "../RepositoryIdentityResolver.ts";
import {
  ProjectAgentHarnessResolver,
  type ProjectAgentHarnessResolution,
  type ProjectAgentHarnessResolverShape,
  type ProjectAgentUnavailableMcpServer,
} from "../Services/ProjectAgentHarnessResolver.ts";
import {
  projectAgentProjectKeyFromSource,
  projectAgentSecretStorageKey,
} from "../projectAgentSecretKeys.ts";

const HARNESS_MANIFEST_RELATIVE_PATH = ".agents/harness.json";
const RESERVED_MCP_NAMES = new Set(["t3-code"]);

function isSecretRefValue(value: unknown): value is ProjectAgentMcpEnvSecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "secretRef" in value &&
    typeof (value as { readonly secretRef?: unknown }).secretRef === "string"
  );
}

function formatSchemaError(error: unknown): string {
  if (error && typeof error === "object" && "issue" in error) {
    return SchemaIssue.makeFormatterDefault()((error as { readonly issue: never }).issue);
  }
  return error instanceof Error ? error.message : String(error);
}

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ProjectAgentHarnessManifestSchema),
);

const emptyResolution = (warnings: readonly string[] = []): ProjectAgentHarnessResolution => ({
  externalMcps: [],
  environment: {},
  secretStatuses: [],
  unavailableMcps: [],
  warnings,
});

const makeProjectAgentHarnessResolver = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const repositoryIdentityResolver = yield* RepositoryIdentityResolver;
  const secretStore = yield* ServerSecretStore;

  const resolveProjectKey = Effect.fn("ProjectAgentHarnessResolver.resolveProjectKey")(function* (
    cwd: string,
  ) {
    const repositoryIdentity = yield* repositoryIdentityResolver.resolve(cwd);
    return projectAgentProjectKeyFromSource({
      source: repositoryIdentity?.canonicalKey ?? cwd,
      sourceKind: repositoryIdentity ? "repository" : "path",
    });
  });

  const readManifest = Effect.fn("ProjectAgentHarnessResolver.readManifest")(function* (
    cwd: string,
  ) {
    const manifestPath = path.join(cwd, HARNESS_MANIFEST_RELATIVE_PATH);
    const exists = yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return { warnings: [] as string[] };

    const raw = yield* fileSystem.readFileString(manifestPath).pipe(
      Effect.mapError(
        (cause) => `Unable to read ${HARNESS_MANIFEST_RELATIVE_PATH}: ${cause.message}`,
      ),
      Effect.result,
    );
    if (Result.isFailure(raw)) return { warnings: [raw.failure] };

    const manifest = yield* decodeManifest(raw.success).pipe(
      Effect.mapError((cause) => formatSchemaError(cause)),
      Effect.result,
    );
    if (Result.isFailure(manifest)) {
      return {
        warnings: [`Invalid ${HARNESS_MANIFEST_RELATIVE_PATH}: ${manifest.failure}`],
      };
    }
    return { manifest: manifest.success as ProjectAgentHarnessManifest, warnings: [] as string[] };
  });

  const resolveEnvValue = Effect.fn("ProjectAgentHarnessResolver.resolveEnvValue")(
    function* (input: {
      readonly projectKey: string;
      readonly value: string | ProjectAgentMcpEnvSecretRef;
    }) {
      if (!isSecretRefValue(input.value)) {
        return { value: input.value, secretRef: undefined, missing: false } as const;
      }
      const secretRef = input.value.secretRef.trim();
      const stored = yield* secretStore
        .get(projectAgentSecretStorageKey({ projectKey: input.projectKey, secretRef }))
        .pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
      if (Option.isNone(stored)) {
        return { secretRef, missing: true } as const;
      }
      return {
        value: new TextDecoder().decode(stored.value),
        secretRef,
        missing: false,
      } as const;
    },
  );

  const resolveSecretStatuses = Effect.fn("ProjectAgentHarnessResolver.resolveSecretStatuses")(
    function* (input: {
      readonly projectKey: string;
      readonly manifest: ProjectAgentHarnessManifest;
    }) {
      const usage = new Map<
        string,
        { readonly mcpServerIds: Set<string>; readonly toolIds: Set<string> }
      >();
      for (const server of input.manifest.mcpServers) {
        for (const envValue of Object.values(server.env ?? {})) {
          if (!isSecretRefValue(envValue)) continue;
          const secretRef = envValue.secretRef.trim();
          if (!secretRef) continue;
          const current = usage.get(secretRef) ?? {
            mcpServerIds: new Set<string>(),
            toolIds: new Set<string>(),
          };
          current.mcpServerIds.add(server.id);
          usage.set(secretRef, current);
        }
      }
      for (const [toolId, toolAuth] of Object.entries(input.manifest.toolAuth)) {
        for (const envValue of Object.values(toolAuth.env ?? {})) {
          if (!isSecretRefValue(envValue)) continue;
          const secretRef = envValue.secretRef.trim();
          if (!secretRef) continue;
          const current = usage.get(secretRef) ?? {
            mcpServerIds: new Set<string>(),
            toolIds: new Set<string>(),
          };
          current.toolIds.add(toolId);
          usage.set(secretRef, current);
        }
      }

      const statuses: ProjectAgentSecretStatus[] = [];
      for (const [secretRef, refs] of usage) {
        const stored = yield* secretStore
          .get(projectAgentSecretStorageKey({ projectKey: input.projectKey, secretRef }))
          .pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
        statuses.push({
          secretRef,
          configured: Option.isSome(stored),
          projectKey: input.projectKey,
          mcpServerIds: [...refs.mcpServerIds].toSorted((left, right) => left.localeCompare(right)),
          toolIds: [...refs.toolIds].toSorted((left, right) => left.localeCompare(right)),
        });
      }
      return statuses.toSorted((left, right) => left.secretRef.localeCompare(right.secretRef));
    },
  );

  const resolveForWorkspace: ProjectAgentHarnessResolverShape["resolveForWorkspace"] = Effect.fn(
    "ProjectAgentHarnessResolver.resolveForWorkspace",
  )(function* (workspaceRoot) {
    if (!workspaceRoot) return emptyResolution();
    const normalizedCwd = yield* workspacePaths
      .normalizeWorkspaceRoot(workspaceRoot)
      .pipe(Effect.result);
    if (Result.isFailure(normalizedCwd)) {
      return emptyResolution([normalizedCwd.failure.message]);
    }

    const manifestResult = yield* readManifest(normalizedCwd.success);
    if (!manifestResult.manifest) {
      return emptyResolution(manifestResult.warnings);
    }

    const projectKey = yield* resolveProjectKey(normalizedCwd.success);
    const externalMcps: McpProviderSession.ExternalMcpProviderSessionConfig[] = [];
    const unavailableMcps: ProjectAgentUnavailableMcpServer[] = [];
    const environment: Record<string, string> = {};

    for (const server of manifestResult.manifest.mcpServers) {
      if (!server.enabled) continue;
      const missingSecretRefs: string[] = [];
      const env: Record<string, string> = {};
      for (const [name, rawValue] of Object.entries(server.env ?? {})) {
        const resolved = yield* resolveEnvValue({ projectKey, value: rawValue });
        if (resolved.missing) {
          if (resolved.secretRef) missingSecretRefs.push(resolved.secretRef);
          continue;
        }
        if (resolved.value !== undefined) {
          env[name] = resolved.value;
          environment[name] = resolved.value;
        }
      }
      if (missingSecretRefs.length > 0 || RESERVED_MCP_NAMES.has(server.name)) {
        unavailableMcps.push({
          id: server.id,
          name: server.name,
          missingSecretRefs,
        });
        continue;
      }
      externalMcps.push({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      });
    }

    for (const toolAuth of Object.values(manifestResult.manifest.toolAuth)) {
      for (const [name, rawValue] of Object.entries(toolAuth.env ?? {})) {
        const resolved = yield* resolveEnvValue({ projectKey, value: rawValue });
        if (!resolved.missing && resolved.value !== undefined) {
          environment[name] = resolved.value;
        }
      }
    }

    const secretStatuses = yield* resolveSecretStatuses({
      projectKey,
      manifest: manifestResult.manifest,
    });
    return {
      externalMcps,
      environment,
      secretStatuses,
      unavailableMcps,
      warnings: manifestResult.warnings,
    };
  });

  return { resolveForWorkspace } satisfies ProjectAgentHarnessResolverShape;
});

export const ProjectAgentHarnessResolverLive = Layer.effect(
  ProjectAgentHarnessResolver,
  makeProjectAgentHarnessResolver,
);
