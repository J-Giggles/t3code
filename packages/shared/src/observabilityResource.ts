export interface T3ObservabilityResourceInput {
  readonly serviceVersion?: string | null | undefined;
  readonly runtimeMode?: string | null | undefined;
  readonly worktreeRole?: string | null | undefined;
  readonly worktreePath?: string | null | undefined;
  readonly gitBranch?: string | null | undefined;
  readonly gitCommit?: string | null | undefined;
  readonly devInstance?: string | null | undefined;
  readonly t3Home?: string | null | undefined;
  readonly threadId?: string | null | undefined;
  readonly turnId?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly providerInstanceId?: string | null | undefined;
}

export type T3ObservabilityResourceEnv = Readonly<Record<string, string | undefined>> & {
  readonly T3CODE_WORKTREE_ROLE?: string | undefined;
  readonly T3CODE_WORKTREE_PATH?: string | undefined;
  readonly T3CODE_GIT_BRANCH?: string | undefined;
  readonly T3CODE_GIT_COMMIT?: string | undefined;
  readonly T3CODE_DEV_INSTANCE?: string | undefined;
  readonly T3CODE_HOME?: string | undefined;
};

const trimToUndefined = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

function setIfPresent(
  attributes: Record<string, string>,
  key: string,
  value: string | null | undefined,
) {
  const normalized = trimToUndefined(value);
  if (normalized !== undefined) {
    attributes[key] = normalized;
  }
}

export function makeT3ObservabilityResourceAttributes(
  input: T3ObservabilityResourceInput,
): Record<string, string> {
  const attributes: Record<string, string> = {};

  setIfPresent(attributes, "service.version", input.serviceVersion);
  setIfPresent(attributes, "service.runtime", input.runtimeMode);
  setIfPresent(attributes, "t3.runtime.mode", input.runtimeMode);
  setIfPresent(attributes, "t3.worktree.role", input.worktreeRole);
  setIfPresent(attributes, "t3.worktree.path", input.worktreePath);
  setIfPresent(attributes, "t3.git.branch", input.gitBranch);
  setIfPresent(attributes, "t3.git.commit", input.gitCommit);
  setIfPresent(attributes, "t3.dev.instance", input.devInstance);
  setIfPresent(attributes, "t3.home", input.t3Home);
  setIfPresent(attributes, "t3.thread.id", input.threadId);
  setIfPresent(attributes, "t3.turn.id", input.turnId);
  setIfPresent(attributes, "t3.provider", input.provider);
  setIfPresent(attributes, "t3.provider.instance_id", input.providerInstanceId);

  return attributes;
}

export function makeT3ObservabilityResourceAttributesFromEnv(
  env: T3ObservabilityResourceEnv,
  input: Omit<
    T3ObservabilityResourceInput,
    "worktreeRole" | "worktreePath" | "gitBranch" | "gitCommit" | "devInstance" | "t3Home"
  > = {},
): Record<string, string> {
  return makeT3ObservabilityResourceAttributes({
    ...input,
    worktreeRole: env.T3CODE_WORKTREE_ROLE,
    worktreePath: env.T3CODE_WORKTREE_PATH,
    gitBranch: env.T3CODE_GIT_BRANCH,
    gitCommit: env.T3CODE_GIT_COMMIT,
    devInstance: env.T3CODE_DEV_INSTANCE,
    t3Home: env.T3CODE_HOME,
  });
}
