import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ProjectAgentFileReadResult,
  ProjectAgentFilesListResult,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { ensureEnvironmentApi } from "~/environmentApi";
import { appAtomRegistry } from "~/rpc/atomRegistry";

const PROJECT_AGENT_FILES_QUERY_STALE_TIME_MS = 30_000;
const PROJECT_AGENT_FILES_QUERY_IDLE_TTL_MS = 5 * 60_000;
const EMPTY_AGENT_FILE_PATH = "";

class ProjectAgentFilesQueryError extends Data.TaggedError("ProjectAgentFilesQueryError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

function queryError(message: string, cause: unknown): ProjectAgentFilesQueryError {
  return new ProjectAgentFilesQueryError({ message, cause });
}

function listKey(environmentId: EnvironmentId, cwd: string): string {
  return [environmentId, cwd].map(encodeURIComponent).join("|");
}

function fileKey(environmentId: EnvironmentId, cwd: string, relativePath: string): string {
  return [environmentId, cwd, relativePath].map(encodeURIComponent).join("|");
}

function keyParts(key: string): string[] {
  return key.split("|").map(decodeURIComponent);
}

const projectAgentFilesListQueryAtom = Atom.family((key: string) =>
  Atom.make(
    Effect.tryPromise({
      try: () => {
        const [environmentId, cwd] = keyParts(key) as [EnvironmentId, string];
        return ensureEnvironmentApi(environmentId).projects.listAgentFiles({ cwd });
      },
      catch: (cause) => queryError("Could not load project agent files.", cause),
    }),
  ).pipe(
    Atom.swr({
      staleTime: PROJECT_AGENT_FILES_QUERY_STALE_TIME_MS,
      revalidateOnMount: true,
    }),
    Atom.setIdleTTL(PROJECT_AGENT_FILES_QUERY_IDLE_TTL_MS),
    Atom.withLabel(`projects:agent-files:${key}`),
  ),
);

const projectAgentFileReadQueryAtom = Atom.family((key: string) =>
  Atom.make(
    Effect.tryPromise({
      try: () => {
        const [environmentId, cwd, relativePath] = keyParts(key) as [EnvironmentId, string, string];
        if (relativePath === EMPTY_AGENT_FILE_PATH) return Promise.resolve(null);
        return ensureEnvironmentApi(environmentId).projects.readAgentFile({ cwd, relativePath });
      },
      catch: (cause) => queryError("Could not read project agent file.", cause),
    }),
  ).pipe(
    Atom.swr({
      staleTime: PROJECT_AGENT_FILES_QUERY_STALE_TIME_MS,
      revalidateOnMount: true,
    }),
    Atom.setIdleTTL(PROJECT_AGENT_FILES_QUERY_IDLE_TTL_MS),
    Atom.withLabel(`projects:agent-file:${key}`),
  ),
);

interface ProjectAgentFilesQueryState<A> {
  readonly data: A | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

function errorMessage<A>(result: AsyncResult.AsyncResult<A, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const cause = Cause.squash(result.cause);
  return cause instanceof Error ? cause.message : "Project agent files query failed.";
}

export function getProjectAgentFilesListQueryAtom(environmentId: EnvironmentId, cwd: string) {
  return projectAgentFilesListQueryAtom(listKey(environmentId, cwd));
}

export function getProjectAgentFileReadQueryAtom(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string | null,
) {
  return projectAgentFileReadQueryAtom(
    fileKey(environmentId, cwd, relativePath ?? EMPTY_AGENT_FILE_PATH),
  );
}

export function refreshProjectAgentFilesQueries(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath?: string | null;
}): void {
  appAtomRegistry.refresh(getProjectAgentFilesListQueryAtom(input.environmentId, input.cwd));
  if (input.relativePath) {
    appAtomRegistry.refresh(
      getProjectAgentFileReadQueryAtom(input.environmentId, input.cwd, input.relativePath),
    );
  }
}

export function useProjectAgentFilesListQuery(
  environmentId: EnvironmentId,
  cwd: string,
): ProjectAgentFilesQueryState<ProjectAgentFilesListResult> {
  const atom = getProjectAgentFilesListQueryAtom(environmentId, cwd);
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  const data = Option.getOrNull(AsyncResult.value(result)) as ProjectAgentFilesListResult | null;
  return {
    data,
    error: errorMessage(result),
    isPending: result.waiting,
    refresh,
  };
}

export function useProjectAgentFileReadQuery(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string | null,
): ProjectAgentFilesQueryState<ProjectAgentFileReadResult> {
  const atom = getProjectAgentFileReadQueryAtom(environmentId, cwd, relativePath);
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  const data = Option.getOrNull(AsyncResult.value(result)) as ProjectAgentFileReadResult | null;
  return {
    data,
    error: errorMessage(result),
    isPending: result.waiting,
    refresh,
  };
}
