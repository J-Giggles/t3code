import type { ProjectAgentSecretStatus } from "@t3tools/contracts";
import type * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ProjectAgentUnavailableMcpServer {
  readonly id: string;
  readonly name: string;
  readonly missingSecretRefs: readonly string[];
}

export interface ProjectAgentHarnessResolution {
  readonly externalMcps: readonly McpProviderSession.ExternalMcpProviderSessionConfig[];
  readonly environment: Readonly<Record<string, string>>;
  readonly secretStatuses: readonly ProjectAgentSecretStatus[];
  readonly unavailableMcps: readonly ProjectAgentUnavailableMcpServer[];
  readonly warnings: readonly string[];
}

export interface ProjectAgentHarnessResolverShape {
  readonly resolveForWorkspace: (
    workspaceRoot: string | undefined,
  ) => Effect.Effect<ProjectAgentHarnessResolution>;
}

export class ProjectAgentHarnessResolver extends Context.Service<
  ProjectAgentHarnessResolver,
  ProjectAgentHarnessResolverShape
>()("t3/project/Services/ProjectAgentHarnessResolver") {}
