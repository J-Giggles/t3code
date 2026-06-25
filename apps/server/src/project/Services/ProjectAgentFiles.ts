import type {
  ProjectAgentFileDeleteInput,
  ProjectAgentFileDeleteResult,
  ProjectAgentFileReadInput,
  ProjectAgentFileReadResult,
  ProjectAgentFilesListInput,
  ProjectAgentFilesListResult,
  ProjectAgentFileWriteInput,
  ProjectAgentFileWriteResult,
  ProjectAgentHarnessScaffoldInput,
  ProjectAgentHarnessScaffoldResult,
  ProjectAgentFileOperationError,
  ProjectAgentSecretDeleteInput,
  ProjectAgentSecretStatus,
  ProjectAgentSecretWriteInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ProjectAgentFilesShape {
  readonly list: (
    input: ProjectAgentFilesListInput,
  ) => Effect.Effect<ProjectAgentFilesListResult, ProjectAgentFileOperationError>;
  readonly read: (
    input: ProjectAgentFileReadInput,
  ) => Effect.Effect<ProjectAgentFileReadResult, ProjectAgentFileOperationError>;
  readonly write: (
    input: ProjectAgentFileWriteInput,
  ) => Effect.Effect<ProjectAgentFileWriteResult, ProjectAgentFileOperationError>;
  readonly delete: (
    input: ProjectAgentFileDeleteInput,
  ) => Effect.Effect<ProjectAgentFileDeleteResult, ProjectAgentFileOperationError>;
  readonly scaffoldHarness: (
    input: ProjectAgentHarnessScaffoldInput,
  ) => Effect.Effect<ProjectAgentHarnessScaffoldResult, ProjectAgentFileOperationError>;
  readonly writeSecret: (
    input: ProjectAgentSecretWriteInput,
  ) => Effect.Effect<ProjectAgentSecretStatus, ProjectAgentFileOperationError>;
  readonly deleteSecret: (
    input: ProjectAgentSecretDeleteInput,
  ) => Effect.Effect<ProjectAgentSecretStatus, ProjectAgentFileOperationError>;
}

export class ProjectAgentFiles extends Context.Service<ProjectAgentFiles, ProjectAgentFilesShape>()(
  "t3/project/Services/ProjectAgentFiles",
) {}
