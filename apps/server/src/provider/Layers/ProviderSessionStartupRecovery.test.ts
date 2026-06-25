import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationCommand,
  type OrchestrationThreadShell,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
} from "@t3tools/contracts";
import { assert, it, vi } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionRuntimeRepository } from "../../persistence/Services/ProviderSessionRuntime.ts";
import { ProviderValidationError } from "../Errors.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import {
  ProviderSessionDirectory,
  type ProviderRuntimeBindingWithMetadata,
} from "../Services/ProviderSessionDirectory.ts";
import { ProviderSessionStartupRecovery } from "../Services/ProviderSessionStartupRecovery.ts";
import { makeProviderSessionStartupRecoveryLive } from "./ProviderSessionStartupRecovery.ts";

const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const codexInstanceId = ProviderInstanceId.make("codex");
const codexProvider = ProviderDriverKind.make("codex");

function makeBinding(
  input: Partial<ProviderRuntimeBindingWithMetadata> & { threadId: ThreadId },
): ProviderRuntimeBindingWithMetadata {
  return {
    threadId: input.threadId,
    provider: input.provider ?? codexProvider,
    providerInstanceId: input.providerInstanceId ?? codexInstanceId,
    adapterKey: input.adapterKey ?? "codex",
    runtimeMode: input.runtimeMode ?? "full-access",
    status: input.status ?? "running",
    resumeCursor:
      "resumeCursor" in input ? input.resumeCursor : { opaque: `resume-${String(input.threadId)}` },
    runtimePayload: input.runtimePayload ?? { cwd: "/tmp/project" },
    lastSeenAt: input.lastSeenAt ?? "2026-05-25T10:00:00.000Z",
  };
}

function makeSession(input: ProviderSessionStartInput): ProviderSession {
  return {
    provider: input.provider ?? codexProvider,
    providerInstanceId: input.providerInstanceId,
    status: "ready",
    runtimeMode: input.runtimeMode,
    threadId: input.threadId,
    resumeCursor: input.resumeCursor ?? { opaque: "resumed" },
    cwd: "/tmp/project",
    createdAt: "2026-05-25T10:00:01.000Z",
    updatedAt: "2026-05-25T10:00:01.000Z",
  };
}

function makeThreadShell(input: {
  readonly threadId: ThreadId;
  readonly sessionStatus?: OrchestrationThreadShell["session"] extends infer S
    ? S extends { readonly status: infer Status }
      ? Status
      : never
    : never;
  readonly activeTurnId?: TurnId | null;
  readonly latestTurn?: OrchestrationThreadShell["latestTurn"];
}): OrchestrationThreadShell {
  const now = "2026-05-25T10:00:00.000Z";
  return {
    id: input.threadId,
    projectId: "project-default" as OrchestrationThreadShell["projectId"],
    title: "Thread",
    modelSelection: {
      instanceId: codexInstanceId,
      model: "gpt-5-codex",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    session: {
      threadId: input.threadId,
      status: input.sessionStatus ?? "running",
      providerName: codexProvider,
      providerInstanceId: codexInstanceId,
      runtimeMode: "full-access",
      activeTurnId: input.activeTurnId ?? TurnId.make("turn-active"),
      lastError: null,
      updatedAt: now,
    },
    latestTurn: input.latestTurn ?? null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  } as OrchestrationThreadShell;
}

function makeHarness(options: {
  readonly bindings: ReadonlyArray<ProviderRuntimeBindingWithMetadata>;
  readonly threadShell?: OrchestrationThreadShell;
  readonly startSession?: (
    threadId: ThreadId,
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderSession, ProviderValidationError>;
  readonly terminateStaleProcess?: (input: {
    readonly binding: ProviderRuntimeBindingWithMetadata;
    readonly pid: number;
  }) => Effect.Effect<void>;
}) {
  const commands: OrchestrationCommand[] = [];
  const deletedRuntimeThreadIds: ThreadId[] = [];
  const startSession = vi.fn(
    options.startSession ??
      ((_threadId: ThreadId, input: ProviderSessionStartInput) =>
        Effect.succeed(makeSession(input))),
  );
  const sendTurn = vi.fn(
    (_input: ProviderSendTurnInput, _options?: { allowEmptyInput?: boolean }) =>
      Effect.succeed({
        threadId: _input.threadId,
        turnId: TurnId.make("turn-continued"),
        resumeCursor: { opaque: "resume-continued" },
      }),
  );
  const threadShell = options.threadShell ?? makeThreadShell({ threadId: asThreadId("thread") });

  const layer = makeProviderSessionStartupRecoveryLive(
    options.terminateStaleProcess
      ? { terminateStaleProcess: options.terminateStaleProcess }
      : undefined,
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(ProviderSessionDirectory, {
          upsert: () => Effect.void,
          getProvider: () => Effect.succeed(codexProvider),
          getBinding: (threadId: ThreadId) => {
            const match = options.bindings.find((binding) => binding.threadId === threadId);
            return Effect.succeed(match ? Option.some(match) : Option.none());
          },
          listThreadIds: () => Effect.succeed(options.bindings.map((binding) => binding.threadId)),
          listBindings: () => Effect.succeed(options.bindings),
        }),
        Layer.succeed(ProviderSessionRuntimeRepository, {
          upsert: () => Effect.void,
          getByThreadId: () => Effect.succeed(Option.none()),
          list: () => Effect.succeed([]),
          deleteByThreadId: ({ threadId }) =>
            Effect.sync(() => {
              deletedRuntimeThreadIds.push(threadId);
            }),
        }),
        Layer.succeed(ProjectionSnapshotQuery, {
          getThreadShellById: (threadId: ThreadId) =>
            Effect.succeed(threadShell.id === threadId ? Option.some(threadShell) : Option.none()),
          getShellSnapshot: () =>
            Effect.succeed({
              snapshotSequence: 0,
              projects: [],
              threads: [threadShell],
              updatedAt: "2026-05-25T10:00:00.000Z",
            }),
        } as unknown as ProjectionSnapshotQuery["Service"]),
        Layer.succeed(ProviderService, {
          startSession,
          sendTurn,
          interruptTurn: () => Effect.die("interruptTurn is not used in startup recovery tests"),
          respondToRequest: () =>
            Effect.die("respondToRequest is not used in startup recovery tests"),
          respondToUserInput: () =>
            Effect.die("respondToUserInput is not used in startup recovery tests"),
          stopSession: () => Effect.die("stopSession is not used in startup recovery tests"),
          listSessions: () => Effect.succeed([]),
          getCapabilities: () =>
            Effect.die("getCapabilities is not used in startup recovery tests"),
          getInstanceInfo: () =>
            Effect.die("getInstanceInfo is not used in startup recovery tests"),
          rollbackConversation: () =>
            Effect.die("rollbackConversation is not used in startup recovery tests"),
          streamEvents: Stream.empty,
        }),
        Layer.succeed(OrchestrationEngineService, {
          readEvents: () => Stream.empty,
          dispatch: (command) =>
            Effect.sync(() => {
              commands.push(command);
              return { sequence: commands.length };
            }),
          streamDomainEvents: Stream.empty,
        }),
      ),
    ),
  );

  return { commands, deletedRuntimeThreadIds, layer, sendTurn, startSession };
}

it.effect("recovers persisted running sessions and reflects them into orchestration", () => {
  const threadId = asThreadId("thread-running");
  const binding = makeBinding({ threadId, status: "running" });
  const harness = makeHarness({ bindings: [binding], threadShell: makeThreadShell({ threadId }) });

  return Effect.gen(function* () {
    const recovery = yield* ProviderSessionStartupRecovery;

    const summary = yield* recovery.recoverActiveSessions;

    assert.equal(summary.recoveredCount, 1);
    assert.equal(harness.startSession.mock.calls.length, 1);
    const startCall = harness.startSession.mock.calls[0];
    assert.equal(startCall?.[0], threadId);
    assert.deepEqual(startCall?.[1], {
      threadId,
      provider: codexProvider,
      providerInstanceId: codexInstanceId,
      resumeCursor: binding.resumeCursor,
      runtimeMode: "full-access",
    });
    const sessionSet = harness.commands.find((command) => command.type === "thread.session.set");
    assert.equal(sessionSet?.type, "thread.session.set");
    if (sessionSet?.type === "thread.session.set") {
      assert.equal(sessionSet.threadId, threadId);
      assert.equal(sessionSet.session.status, "ready");
      assert.equal(sessionSet.session.providerName, "codex");
      assert.equal(sessionSet.session.providerInstanceId, codexInstanceId);
      assert.equal(sessionSet.session.activeTurnId, null);
      assert.equal(sessionSet.session.lastError, null);
    }
  }).pipe(Effect.provide(harness.layer));
});

it.effect("reaps a persisted provider pid before recovering the replacement session", () => {
  const threadId = asThreadId("thread-running-stale-pid");
  const binding = makeBinding({
    threadId,
    status: "running",
    runtimePayload: { cwd: "/tmp/project", pid: 1234 },
  });
  const terminated: Array<{ threadId: ThreadId; pid: number }> = [];
  const harness = makeHarness({
    bindings: [binding],
    threadShell: makeThreadShell({ threadId }),
    terminateStaleProcess: ({ binding, pid }) =>
      Effect.sync(() => {
        terminated.push({ threadId: binding.threadId, pid });
      }),
    startSession: (_threadId, input) =>
      Effect.sync(() => {
        assert.deepEqual(terminated, [{ threadId, pid: 1234 }]);
        return makeSession(input);
      }),
  });

  return Effect.gen(function* () {
    const recovery = yield* ProviderSessionStartupRecovery;

    yield* recovery.recoverActiveSessions;

    assert.equal(harness.startSession.mock.calls.length, 1);
    assert.deepEqual(terminated, [{ threadId, pid: 1234 }]);
  }).pipe(Effect.provide(harness.layer));
});

it.effect("continues an unfinished turn after recovering the provider session", () => {
  const threadId = asThreadId("thread-manual-recover-unfinished");
  const turnId = TurnId.make("turn-unfinished");
  const binding = makeBinding({ threadId, status: "stopped" });
  const harness = makeHarness({
    bindings: [binding],
    threadShell: makeThreadShell({
      threadId,
      sessionStatus: "stopped",
      activeTurnId: null,
      latestTurn: {
        turnId,
        state: "running",
        requestedAt: "2026-05-25T10:00:00.000Z",
        startedAt: "2026-05-25T10:00:00.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    }),
  });

  return Effect.gen(function* () {
    const recovery = yield* ProviderSessionStartupRecovery;

    yield* recovery.recoverThreadSession(threadId);

    assert.equal(harness.startSession.mock.calls.length, 1);
    assert.equal(harness.sendTurn.mock.calls.length, 1);
    assert.deepEqual(harness.sendTurn.mock.calls[0]?.[0], { threadId });
    assert.deepEqual(harness.sendTurn.mock.calls[0]?.[1], { allowEmptyInput: true });
    const sessionSets = harness.commands.filter((command) => command.type === "thread.session.set");
    assert.equal(sessionSets.length, 2);
    const continuedSessionSet = sessionSets[1];
    assert.equal(continuedSessionSet?.type, "thread.session.set");
    if (continuedSessionSet?.type === "thread.session.set") {
      assert.equal(continuedSessionSet.session.status, "running");
      assert.equal(continuedSessionSet.session.activeTurnId, TurnId.make("turn-continued"));
      assert.equal(continuedSessionSet.session.lastError, null);
    }
  }).pipe(Effect.provide(harness.layer));
});

it.effect("manual recovery without resume state resets the stuck session to ready", () => {
  const threadId = asThreadId("thread-manual-missing-resume");
  const harness = makeHarness({
    bindings: [
      makeBinding({
        threadId,
        status: "stopped",
        resumeCursor: null,
      }),
    ],
    threadShell: makeThreadShell({ threadId }),
  });

  return Effect.gen(function* () {
    const recovery = yield* ProviderSessionStartupRecovery;

    yield* recovery.recoverThreadSession(threadId);

    assert.equal(harness.startSession.mock.calls.length, 0);
    const turnInterrupt = harness.commands.find(
      (command) => command.type === "thread.turn.interrupt",
    );
    assert.equal(turnInterrupt?.type, "thread.turn.interrupt");
    const sessionSet = harness.commands.find((command) => command.type === "thread.session.set");
    assert.equal(sessionSet?.type, "thread.session.set");
    if (sessionSet?.type === "thread.session.set") {
      assert.equal(sessionSet.threadId, threadId);
      assert.equal(sessionSet.session.status, "ready");
      assert.equal(sessionSet.session.activeTurnId, null);
      assert.equal(sessionSet.session.lastError, MISSING_RESUME_STATE_ERROR_FOR_TEST);
    }
    assert.deepEqual(harness.deletedRuntimeThreadIds, [threadId]);
  }).pipe(Effect.provide(harness.layer));
});

it.effect("marks active persisted sessions without resume state as errored", () => {
  const threadId = asThreadId("thread-missing-resume");
  const harness = makeHarness({
    bindings: [
      makeBinding({
        threadId,
        status: "starting",
        resumeCursor: null,
      }),
    ],
    threadShell: makeThreadShell({ threadId }),
  });

  return Effect.gen(function* () {
    const recovery = yield* ProviderSessionStartupRecovery;

    const summary = yield* recovery.recoverActiveSessions;

    assert.equal(summary.failedCount, 1);
    assert.equal(harness.startSession.mock.calls.length, 0);
    const sessionSet = harness.commands.find((command) => command.type === "thread.session.set");
    assert.equal(sessionSet?.type, "thread.session.set");
    if (sessionSet?.type === "thread.session.set") {
      assert.equal(sessionSet.threadId, threadId);
      assert.equal(sessionSet.session.status, "error");
      assert.equal(sessionSet.session.lastError, MISSING_RESUME_STATE_ERROR_FOR_TEST);
    }
    assert.deepEqual(harness.deletedRuntimeThreadIds, [threadId]);
  }).pipe(Effect.provide(harness.layer));
});

const MISSING_RESUME_STATE_ERROR_FOR_TEST =
  "T3 Code restarted while this chat was active, but no provider resume state was persisted. Start a new turn to continue.";
