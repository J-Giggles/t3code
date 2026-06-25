import {
  CommandId,
  DEFAULT_RUNTIME_MODE,
  EventId,
  type OrchestrationSession,
  type OrchestrationSessionStatus,
  type OrchestrationShellSnapshot,
  type ProviderSession,
  type ProviderSessionRecoverySummary,
  type ProviderSessionRuntimeStatus,
  type ThreadId,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionRuntimeRepository } from "../../persistence/Services/ProviderSessionRuntime.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import {
  ProviderSessionDirectory,
  type ProviderRuntimeBindingWithMetadata,
} from "../Services/ProviderSessionDirectory.ts";
import {
  ProviderSessionStartupRecovery,
  type ProviderSessionStartupRecoveryShape,
} from "../Services/ProviderSessionStartupRecovery.ts";
import { terminateProcessTree } from "../processTree.ts";

const RECOVERABLE_STATUSES = new Set<ProviderSessionRuntimeStatus>([
  "running",
  "starting",
  "paused",
]);

const MISSING_RESUME_STATE_ERROR =
  "T3 Code restarted while this chat was active, but no provider resume state was persisted. Start a new turn to continue.";

const MISSING_BINDING_ERROR =
  "Cannot recover this chat because no provider session binding was persisted.";

const EMPTY_RECOVERY_SUMMARY: ProviderSessionRecoverySummary = {
  recoveredCount: 0,
  needsResumeCount: 0,
  failedCount: 0,
  needsResumeThreadIds: [],
};

const EMPTY_SHELL_SNAPSHOT: OrchestrationShellSnapshot = {
  snapshotSequence: 0,
  projects: [],
  threads: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const IMMEDIATE_RESUMABLE_SESSION_STATUSES = new Set<OrchestrationSessionStatus>([
  "ready",
  "paused",
  "interrupted",
  "stopped",
]);

function mapProviderSessionStatusToOrchestrationStatus(
  status: ProviderSession["status"],
): OrchestrationSession["status"] {
  switch (status) {
    case "connecting":
      return "starting";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "closed":
      return "stopped";
    case "ready":
    default:
      return "ready";
  }
}

function isNeedsResumeThreadShell(thread: {
  readonly session?: OrchestrationSession | null;
  readonly latestTurn?: {
    readonly startedAt?: string | null;
    readonly completedAt?: string | null;
  } | null;
}): boolean {
  const session = thread.session;
  const latestTurn = thread.latestTurn;
  if (!session || !latestTurn?.startedAt || latestTurn.completedAt) {
    return false;
  }
  return IMMEDIATE_RESUMABLE_SESSION_STATUSES.has(session.status);
}

export interface ProviderSessionStartupRecoveryLiveOptions {
  readonly terminateStaleProcess?: (input: {
    readonly binding: ProviderRuntimeBindingWithMetadata;
    readonly pid: number;
  }) => Effect.Effect<void>;
}

function trimErrorDetail(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : "Provider session recovery failed.";
}

function readPersistedPid(runtimePayload: ProviderRuntimeBindingWithMetadata["runtimePayload"]) {
  if (!runtimePayload || typeof runtimePayload !== "object" || Array.isArray(runtimePayload)) {
    return undefined;
  }
  const rawPid = "pid" in runtimePayload ? runtimePayload.pid : undefined;
  return Number.isInteger(rawPid) && typeof rawPid === "number" && rawPid > 0 ? rawPid : undefined;
}

function normalizeCommandLine(raw: string): string {
  return raw.replaceAll("\0", " ").toLowerCase();
}

function providerProcessCommandLineMatches(
  provider: ProviderRuntimeBindingWithMetadata["provider"],
  rawCommandLine: string,
): boolean {
  const commandLine = normalizeCommandLine(rawCommandLine);
  switch (provider) {
    case "cursor":
      return commandLine.includes(" acp") && commandLine.includes("agent");
    case "codex":
      return commandLine.includes("codex") && commandLine.includes("app-server");
    default:
      return false;
  }
}

const make = (options?: ProviderSessionStartupRecoveryLiveOptions) =>
  Effect.gen(function* () {
    const directory = yield* ProviderSessionDirectory;
    const runtimeRepository = yield* ProviderSessionRuntimeRepository;
    const providerService = yield* ProviderService;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const hostPlatform = yield* HostProcessPlatform;
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const randomUUIDv4 = crypto.randomUUIDv4;
    const serverCommandId = (tag: string) =>
      randomUUIDv4.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));
    const serverEventId = () => randomUUIDv4.pipe(Effect.map(EventId.make));

    const readLinuxProcessCommandLine = (pid: number): Effect.Effect<string | undefined> =>
      hostPlatform !== "linux"
        ? Effect.sync(() => undefined)
        : fileSystem
            .readFileString(`/proc/${pid}/cmdline`)
            .pipe(Effect.orElseSucceed(() => undefined));

    const defaultTerminateStaleProcess = (input: {
      readonly binding: ProviderRuntimeBindingWithMetadata;
      readonly pid: number;
    }) =>
      Effect.gen(function* () {
        const commandLine = yield* readLinuxProcessCommandLine(input.pid);
        if (
          commandLine === undefined ||
          !providerProcessCommandLineMatches(input.binding.provider, commandLine)
        ) {
          yield* Effect.logDebug("provider.session.recovery.stale-pid-skipped", {
            threadId: input.binding.threadId,
            provider: input.binding.provider,
            pid: input.pid,
            reason: commandLine === undefined ? "cmdline-unavailable" : "cmdline-mismatch",
          });
          return;
        }

        yield* terminateProcessTree(input.pid, hostPlatform);
        yield* Effect.logInfo("provider.session.recovery.stale-pid-reaped", {
          threadId: input.binding.threadId,
          provider: input.binding.provider,
          pid: input.pid,
        });
      });

    const terminateStaleProcess = options?.terminateStaleProcess ?? defaultTerminateStaleProcess;

    const terminatePersistedProcessIfPresent = (binding: ProviderRuntimeBindingWithMetadata) =>
      Effect.gen(function* () {
        const pid = readPersistedPid(binding.runtimePayload);
        if (pid === undefined) {
          return;
        }
        yield* terminateStaleProcess({ binding, pid }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.recovery.stale-pid-reap-failed", {
              threadId: binding.threadId,
              provider: binding.provider,
              pid,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      });

    const setThreadSession = (input: {
      readonly binding: ProviderRuntimeBindingWithMetadata;
      readonly session: OrchestrationSession;
      readonly createdAt: string;
    }) =>
      Effect.gen(function* () {
        const commandId = yield* serverCommandId("provider-startup-recovery-session-set");
        yield* orchestrationEngine.dispatch({
          type: "thread.session.set",
          commandId,
          threadId: input.binding.threadId,
          session: input.session,
          createdAt: input.createdAt,
        });
      });

    const appendRecoveryFailureActivity = (input: {
      readonly threadId: ThreadId;
      readonly detail: string;
      readonly createdAt: string;
    }) =>
      Effect.gen(function* () {
        const [commandId, activityId] = yield* Effect.all([
          serverCommandId("provider-startup-recovery-failure-activity"),
          serverEventId(),
        ]);
        yield* orchestrationEngine.dispatch({
          type: "thread.activity.append",
          commandId,
          threadId: input.threadId,
          activity: {
            id: activityId,
            tone: "error",
            kind: "provider.session.recovery.failed",
            summary: "Provider session recovery failed",
            payload: { detail: input.detail },
            turnId: null,
            createdAt: input.createdAt,
          },
          createdAt: input.createdAt,
        });
      });

    const releaseStuckOrchestrationState = Effect.fn("releaseStuckOrchestrationState")(
      function* (input: {
        readonly threadId: ThreadId;
        readonly detail: string;
        readonly createdAt: string;
        readonly sessionStatus: Extract<OrchestrationSessionStatus, "ready" | "error" | "stopped">;
      }) {
        const thread = yield* projectionSnapshotQuery
          .getThreadShellById(input.threadId)
          .pipe(Effect.map(Option.getOrUndefined));
        const session = thread?.session;
        if (!session) {
          return;
        }

        const activeTurnId = session.activeTurnId;
        if (activeTurnId) {
          const interruptCommandId = yield* serverCommandId(
            "provider-startup-recovery-turn-interrupt",
          );
          yield* orchestrationEngine.dispatch({
            type: "thread.turn.interrupt",
            commandId: interruptCommandId,
            threadId: input.threadId,
            turnId: activeTurnId,
            createdAt: input.createdAt,
          });
        }

        const sessionSetCommandId = yield* serverCommandId(
          "provider-startup-recovery-session-reset",
        );
        yield* orchestrationEngine.dispatch({
          type: "thread.session.set",
          commandId: sessionSetCommandId,
          threadId: input.threadId,
          session: {
            threadId: input.threadId,
            status: input.sessionStatus,
            providerName: session.providerName ?? null,
            ...(session.providerInstanceId !== undefined
              ? { providerInstanceId: session.providerInstanceId }
              : {}),
            runtimeMode: session.runtimeMode ?? DEFAULT_RUNTIME_MODE,
            activeTurnId: null,
            lastError: input.detail,
            updatedAt: input.createdAt,
          },
          createdAt: input.createdAt,
        });
      },
    );

    const interruptPreviousActiveTurnWhenRecoveredIdle = Effect.fn(
      "interruptPreviousActiveTurnWhenRecoveredIdle",
    )(function* (input: { readonly threadId: ThreadId; readonly createdAt: string }) {
      const thread = yield* projectionSnapshotQuery
        .getThreadShellById(input.threadId)
        .pipe(Effect.map(Option.getOrUndefined));
      const activeTurnId = thread?.session?.activeTurnId;
      if (!activeTurnId) {
        return;
      }
      const interruptCommandId = yield* serverCommandId("provider-startup-recovery-turn-interrupt");
      yield* orchestrationEngine.dispatch({
        type: "thread.turn.interrupt",
        commandId: interruptCommandId,
        threadId: input.threadId,
        turnId: activeTurnId,
        createdAt: input.createdAt,
      });
    });

    const recoveryStatsRef = yield* Ref.make({ recoveredCount: 0, failedCount: 0 });

    const setRecoveryError = (input: {
      readonly binding: ProviderRuntimeBindingWithMetadata;
      readonly detail: string;
      readonly sessionStatus?: Extract<OrchestrationSessionStatus, "ready" | "error" | "stopped">;
      readonly deleteRuntimeBinding?: boolean;
    }) =>
      Effect.gen(function* () {
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        const detail = trimErrorDetail(input.detail);
        yield* Ref.update(recoveryStatsRef, (stats) => ({
          ...stats,
          failedCount: stats.failedCount + 1,
        }));
        yield* appendRecoveryFailureActivity({
          threadId: input.binding.threadId,
          detail,
          createdAt,
        });
        yield* releaseStuckOrchestrationState({
          threadId: input.binding.threadId,
          detail,
          createdAt,
          sessionStatus: input.sessionStatus ?? "error",
        });
        if (input.deleteRuntimeBinding === true) {
          yield* runtimeRepository.deleteByThreadId({ threadId: input.binding.threadId });
        }
      });

    const recoverBinding = Effect.fn("recoverProviderSessionBinding")(function* (
      binding: ProviderRuntimeBindingWithMetadata,
      options?: { readonly force?: boolean },
    ) {
      if (
        !options?.force &&
        (binding.status === undefined || !RECOVERABLE_STATUSES.has(binding.status))
      ) {
        return;
      }

      yield* terminatePersistedProcessIfPresent(binding);

      if (binding.resumeCursor === null || binding.resumeCursor === undefined) {
        yield* setRecoveryError({
          binding,
          detail: MISSING_RESUME_STATE_ERROR,
          sessionStatus: options?.force ? "ready" : "error",
          deleteRuntimeBinding: true,
        });
        return;
      }

      const threadBeforeRecovery = yield* projectionSnapshotQuery
        .getThreadShellById(binding.threadId)
        .pipe(Effect.map(Option.getOrUndefined));
      const shouldContinueUnfinishedTurn =
        threadBeforeRecovery !== undefined && isNeedsResumeThreadShell(threadBeforeRecovery);

      const session = yield* providerService.startSession(binding.threadId, {
        threadId: binding.threadId,
        provider: binding.provider,
        ...(binding.providerInstanceId !== undefined
          ? { providerInstanceId: binding.providerInstanceId }
          : {}),
        resumeCursor: binding.resumeCursor,
        runtimeMode: binding.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      });
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      if (
        !shouldContinueUnfinishedTurn &&
        (session.activeTurnId === undefined || session.activeTurnId === null)
      ) {
        yield* interruptPreviousActiveTurnWhenRecoveredIdle({
          threadId: binding.threadId,
          createdAt,
        });
      }
      yield* setThreadSession({
        binding,
        session: {
          threadId: binding.threadId,
          status: mapProviderSessionStatusToOrchestrationStatus(session.status),
          providerName: session.provider,
          ...(session.providerInstanceId !== undefined
            ? { providerInstanceId: session.providerInstanceId }
            : {}),
          runtimeMode: session.runtimeMode,
          activeTurnId: session.activeTurnId ?? null,
          lastError: session.lastError ?? null,
          updatedAt: session.updatedAt,
        },
        createdAt,
      });
      if (shouldContinueUnfinishedTurn) {
        const turn = yield* providerService.sendTurn(
          {
            threadId: binding.threadId,
          },
          { allowEmptyInput: true },
        );
        const continuedAt = DateTime.formatIso(yield* DateTime.now);
        yield* setThreadSession({
          binding,
          session: {
            threadId: binding.threadId,
            status: "running",
            providerName: session.provider,
            ...(session.providerInstanceId !== undefined
              ? { providerInstanceId: session.providerInstanceId }
              : {}),
            runtimeMode: session.runtimeMode,
            activeTurnId: turn.turnId,
            lastError: null,
            updatedAt: continuedAt,
          },
          createdAt: continuedAt,
        });
      }
      yield* Ref.update(recoveryStatsRef, (stats) => ({
        ...stats,
        recoveredCount: stats.recoveredCount + 1,
      }));
    });

    const recoverThreadSession: ProviderSessionStartupRecoveryShape["recoverThreadSession"] =
      Effect.fn("recoverThreadSession")(function* (threadId: ThreadId) {
        const bindings = yield* directory.listBindings();
        const binding = bindings.find((entry) => entry.threadId === threadId);
        if (!binding) {
          const createdAt = DateTime.formatIso(yield* DateTime.now);
          const detail = MISSING_BINDING_ERROR;
          yield* appendRecoveryFailureActivity({
            threadId,
            detail,
            createdAt,
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                "provider session manual recovery failed to record missing binding",
                {
                  threadId,
                  cause: Cause.pretty(cause),
                },
              ),
            ),
          );
          yield* releaseStuckOrchestrationState({
            threadId,
            detail,
            createdAt,
            sessionStatus: "ready",
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("provider session manual recovery failed to release stuck state", {
                threadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
          return;
        }

        yield* recoverBinding(binding, { force: true }).pipe(
          Effect.catchCause((cause) =>
            setRecoveryError({
              binding,
              detail: Cause.pretty(cause),
            }).pipe(
              Effect.catchCause((recoveryCause) =>
                Effect.logWarning("provider session manual recovery failed to record error", {
                  threadId,
                  cause: Cause.pretty(recoveryCause),
                  originalCause: Cause.pretty(cause),
                }),
              ),
            ),
          ),
        );
      });

    const recoverActiveSessions: ProviderSessionStartupRecoveryShape["recoverActiveSessions"] =
      Effect.gen(function* () {
        const bindings = yield* directory.listBindings();
        if (bindings.length === 0) {
          return EMPTY_RECOVERY_SUMMARY;
        }
        yield* Effect.forEach(
          bindings,
          (binding) =>
            recoverBinding(binding).pipe(
              Effect.catchCause((cause) =>
                setRecoveryError({
                  binding,
                  detail: Cause.pretty(cause),
                }).pipe(
                  Effect.catchCause((recoveryCause) =>
                    Effect.logWarning("provider session startup recovery failed to record error", {
                      threadId: binding.threadId,
                      cause: Cause.pretty(recoveryCause),
                      originalCause: Cause.pretty(cause),
                    }),
                  ),
                ),
              ),
            ),
          { discard: true, concurrency: 4 },
        );

        const stats = yield* Ref.get(recoveryStatsRef);
        const shell = yield* projectionSnapshotQuery.getShellSnapshot().pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logWarning("provider session recovery shell scan failed", {
                cause: Cause.pretty(cause),
              });
              return EMPTY_SHELL_SNAPSHOT;
            }),
          ),
        );
        const needsResumeThreadIds = shell.threads
          .filter((thread) => isNeedsResumeThreadShell(thread))
          .map((thread) => thread.id);

        const summary: ProviderSessionRecoverySummary = {
          recoveredCount: stats.recoveredCount,
          failedCount: stats.failedCount,
          needsResumeCount: needsResumeThreadIds.length,
          needsResumeThreadIds,
        };

        yield* Effect.logInfo("provider.session.recovery.summary", summary);
        return summary;
      });

    return {
      recoverActiveSessions,
      recoverThreadSession,
    } satisfies ProviderSessionStartupRecoveryShape;
  });

export const makeProviderSessionStartupRecoveryLive = (
  options?: ProviderSessionStartupRecoveryLiveOptions,
) => Layer.effect(ProviderSessionStartupRecovery, make(options));

export const ProviderSessionStartupRecoveryLive = makeProviderSessionStartupRecoveryLive();
