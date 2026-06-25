import type { ProjectDevLaunchProfile, ProjectDevLaunchWarning } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ProjectDevLaunchResolution {
  readonly profiles: readonly ProjectDevLaunchProfile[];
  readonly warnings: readonly ProjectDevLaunchWarning[];
}

export interface ProjectDevLaunchResolverShape {
  readonly resolveForWorkspace: (
    workspaceRoot: string,
  ) => Effect.Effect<ProjectDevLaunchResolution>;
}

export class ProjectDevLaunchResolver extends Context.Service<
  ProjectDevLaunchResolver,
  ProjectDevLaunchResolverShape
>()("t3/project/Services/ProjectDevLaunchResolver") {}
