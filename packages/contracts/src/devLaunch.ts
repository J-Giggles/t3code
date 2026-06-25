import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ProjectDevLaunchEnvBinding = Schema.Struct({
  file: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
  value: TrimmedNonEmptyString,
});
export type ProjectDevLaunchEnvBinding = typeof ProjectDevLaunchEnvBinding.Type;

export const ProjectDevLaunchProfile = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  healthCheckPath: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("/"))),
  host: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("127.0.0.1"))),
  port: PositiveInt,
  appSegment: Schema.optionalKey(TrimmedNonEmptyString),
  envBindings: Schema.Array(ProjectDevLaunchEnvBinding),
});
export type ProjectDevLaunchProfile = typeof ProjectDevLaunchProfile.Type;

export const ProjectDevLaunchManifest = Schema.Struct({
  version: Schema.Literal(1),
  profiles: Schema.Array(ProjectDevLaunchProfile),
});
export type ProjectDevLaunchManifest = typeof ProjectDevLaunchManifest.Type;

export const ProjectDevLaunchWarning = Schema.Struct({
  message: TrimmedNonEmptyString,
});
export type ProjectDevLaunchWarning = typeof ProjectDevLaunchWarning.Type;

export const DesktopDevLaunchStatus = Schema.Literals([
  "stopped",
  "starting",
  "running",
  "failed",
  "blocked",
]);
export type DesktopDevLaunchStatus = typeof DesktopDevLaunchStatus.Type;

export const DesktopDevLaunchThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type DesktopDevLaunchThreadRef = typeof DesktopDevLaunchThreadRef.Type;

export const DesktopDevLaunchRecord = Schema.Struct({
  threadRef: DesktopDevLaunchThreadRef,
  projectId: ProjectId,
  projectRoot: TrimmedNonEmptyString,
  projectSlug: TrimmedNonEmptyString,
  canonicalWorktreePath: TrimmedNonEmptyString,
  worktreeSlug: TrimmedNonEmptyString,
  profileId: TrimmedNonEmptyString,
  profileName: TrimmedNonEmptyString,
  profileCwd: TrimmedNonEmptyString,
  appSegment: TrimmedNonEmptyString,
  localPort: PositiveInt,
  localHost: TrimmedNonEmptyString,
  localUrl: TrimmedNonEmptyString,
  publicPath: TrimmedNonEmptyString,
  publicUrl: TrimmedNonEmptyString,
  pid: PositiveInt,
  startedAt: TrimmedNonEmptyString,
  status: DesktopDevLaunchStatus,
});
export type DesktopDevLaunchRecord = typeof DesktopDevLaunchRecord.Type;

export const DesktopDevLaunchState = Schema.Struct({
  current: Schema.NullOr(DesktopDevLaunchRecord),
  active: Schema.Array(DesktopDevLaunchRecord),
});
export type DesktopDevLaunchState = typeof DesktopDevLaunchState.Type;

export const DesktopDevLaunchWorktreeConflict = Schema.Struct({
  type: Schema.Literal("worktree-conflict"),
  requestedProfileId: TrimmedNonEmptyString,
  blocking: DesktopDevLaunchRecord,
});
export type DesktopDevLaunchWorktreeConflict = typeof DesktopDevLaunchWorktreeConflict.Type;

export const DesktopDevLaunchPortConflict = Schema.Struct({
  type: Schema.Literal("port-conflict"),
  requestedProfileId: TrimmedNonEmptyString,
  requestedPort: PositiveInt,
  blocking: DesktopDevLaunchRecord,
});
export type DesktopDevLaunchPortConflict = typeof DesktopDevLaunchPortConflict.Type;

export const DesktopDevLaunchRouteConflict = Schema.Struct({
  type: Schema.Literal("route-conflict"),
  requestedProfileId: TrimmedNonEmptyString,
  servePath: TrimmedNonEmptyString,
  servePort: PositiveInt,
  existingProxyUrl: TrimmedNonEmptyString,
  expectedProxyUrl: TrimmedNonEmptyString,
});
export type DesktopDevLaunchRouteConflict = typeof DesktopDevLaunchRouteConflict.Type;

export const DesktopDevLaunchCollision = Schema.Union([
  DesktopDevLaunchWorktreeConflict,
  DesktopDevLaunchPortConflict,
  DesktopDevLaunchRouteConflict,
]);
export type DesktopDevLaunchCollision = typeof DesktopDevLaunchCollision.Type;

export const DesktopDevLaunchLaunchInput = Schema.Struct({
  threadRef: DesktopDevLaunchThreadRef,
  projectId: ProjectId,
  projectRoot: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  profileId: TrimmedNonEmptyString,
});
export type DesktopDevLaunchLaunchInput = typeof DesktopDevLaunchLaunchInput.Type;

export const DesktopDevLaunchStopInput = Schema.Struct({
  threadRef: DesktopDevLaunchThreadRef,
});
export type DesktopDevLaunchStopInput = typeof DesktopDevLaunchStopInput.Type;

export const DesktopDevLaunchCollisionPromptInput = Schema.Struct({
  collision: DesktopDevLaunchCollision,
  requestedThreadRef: DesktopDevLaunchThreadRef,
});
export type DesktopDevLaunchCollisionPromptInput = typeof DesktopDevLaunchCollisionPromptInput.Type;

export const DesktopDevLaunchCollisionPromptResult = Schema.Struct({
  prompt: TrimmedNonEmptyString,
});
export type DesktopDevLaunchCollisionPromptResult =
  typeof DesktopDevLaunchCollisionPromptResult.Type;

export const DesktopDevLaunchSetupInput = Schema.Struct({
  threadRef: DesktopDevLaunchThreadRef,
  projectId: ProjectId,
  projectRoot: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
});
export type DesktopDevLaunchSetupInput = typeof DesktopDevLaunchSetupInput.Type;

export class DesktopDevLaunchError extends Schema.TaggedErrorClass<DesktopDevLaunchError>()(
  "DesktopDevLaunchError",
  {
    message: TrimmedNonEmptyString,
    collision: Schema.optional(DesktopDevLaunchCollision),
  },
) {}
