import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import {
  AuthSessionId,
  CheckpointRef,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import {
  AuthSessionRepository,
  type AuthSessionRepositoryShape,
} from "../../persistence/Services/AuthSessions.ts";
import { ConnectedDeviceNotifications } from "../Services/ConnectedDeviceNotifications.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "../Services/ProjectionSnapshotQuery.ts";
import { ConnectedDeviceNotificationsLive } from "./ConnectedDeviceNotifications.ts";

const threadId = ThreadId.make("thread-notifications");
const projectId = ProjectId.make("project-notifications");
const dateTime = DateTime.makeUnsafe("2026-06-15T12:00:00.000Z");
const isoDateTime = "2026-06-15T12:00:00.000Z";

function baseEvent(
  type: OrchestrationEvent["type"],
  payload: OrchestrationEvent["payload"],
): OrchestrationEvent {
  return {
    sequence: 1,
    eventId: EventId.make(`event-${type}`),
    aggregateKind: "thread",
    aggregateId: threadId,
    occurredAt: isoDateTime,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type,
    payload,
  } as OrchestrationEvent;
}

const turnDiffCompletedEvent = baseEvent("thread.turn-diff-completed", {
  threadId,
  turnId: TurnId.make("turn-notifications"),
  checkpointTurnCount: 1,
  checkpointRef: CheckpointRef.make("checkpoint-notifications"),
  status: "ready",
  files: [],
  assistantMessageId: null,
  completedAt: isoDateTime,
});

function parseJsonBody(request: { readonly body: unknown }): unknown {
  const rawBody = (request.body as { readonly body?: Uint8Array }).body;
  expect(rawBody).toBeDefined();
  return JSON.parse(new TextDecoder().decode(rawBody));
}

function makeSession(input: {
  readonly sessionId: string;
  readonly deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  readonly token: string | null;
}) {
  return {
    sessionId: AuthSessionId.make(input.sessionId),
    subject: "test",
    scopes: ["orchestration:read"],
    method: "bearer-access-token",
    client: {
      label: null,
      ipAddress: null,
      userAgent: null,
      deviceType: input.deviceType,
      os: null,
      browser: null,
    },
    issuedAt: dateTime,
    expiresAt: DateTime.makeUnsafe("2026-06-16T12:00:00.000Z"),
    lastConnectedAt: null,
    revokedAt: null,
    pushNotificationToken: input.token,
    pushNotificationPlatform: input.token === null ? null : "expo",
  } as const;
}

type TestLayer = ReturnType<typeof makeLayer>;

function makeLayer(input: {
  readonly queue: Queue.Queue<OrchestrationEvent>;
  readonly delivered: Deferred.Deferred<HttpClientRequest.HttpClientRequest>;
  readonly status?: number;
  readonly sessions?: ReadonlyArray<ReturnType<typeof makeSession>>;
}) {
  const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) => {
    const response = HttpClientResponse.fromWeb(
      request,
      new Response("", { status: input.status ?? 200 }),
    );
    return Deferred.succeed(input.delivered, request).pipe(Effect.as(response));
  });

  const authSessions = {
    create: () => Effect.void,
    getById: () => Effect.succeed(Option.none()),
    listActive: () =>
      Effect.succeed(
        input.sessions ?? [
          makeSession({
            sessionId: "mobile-1",
            deviceType: "mobile",
            token: "ExponentPushToken[1]",
          }),
          makeSession({
            sessionId: "tablet-1",
            deviceType: "tablet",
            token: "ExponentPushToken[2]",
          }),
          makeSession({
            sessionId: "desktop-1",
            deviceType: "desktop",
            token: "ExponentPushToken[3]",
          }),
          makeSession({ sessionId: "mobile-2", deviceType: "mobile", token: null }),
        ],
      ),
    revoke: () => Effect.succeed(false),
    revokeAllExcept: () => Effect.succeed([]),
    setLastConnectedAt: () => Effect.void,
    setPushNotificationToken: () => Effect.void,
  } satisfies AuthSessionRepositoryShape;

  const projectionSnapshotQuery = {
    getThreadShellById: () =>
      Effect.succeed(
        Option.some({
          id: threadId,
          projectId,
          title: "Notification Thread",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.4",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          latestTurn: null,
          createdAt: isoDateTime,
          updatedAt: isoDateTime,
          archivedAt: null,
          session: null,
          latestUserMessageAt: null,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          hasActionableProposedPlan: false,
        }),
      ),
  } as unknown as ProjectionSnapshotQueryShape;

  const orchestrationEngine = {
    readEvents: () => Stream.empty,
    dispatch: () => Effect.die("dispatch unused"),
    streamDomainEvents: Stream.fromQueue(input.queue),
  } as unknown as OrchestrationEngineShape;

  return {
    execute,
    layer: ConnectedDeviceNotificationsLive.pipe(
      Layer.provide(Layer.succeed(AuthSessionRepository, authSessions)),
      Layer.provide(Layer.succeed(ProjectionSnapshotQuery, projectionSnapshotQuery)),
      Layer.provide(Layer.succeed(OrchestrationEngineService, orchestrationEngine)),
      Layer.provide(Layer.succeed(HttpClient.HttpClient, HttpClient.make(execute))),
    ),
  };
}

const withNotifications = <A, E>(
  context: TestLayer,
  effect: Effect.Effect<A, E, ConnectedDeviceNotifications | Scope.Scope>,
) => Effect.scoped(effect).pipe(Effect.provide(context.layer));

it.effect("sends Expo notifications only to active mobile and tablet sessions with tokens", () =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<OrchestrationEvent>();
    const delivered = yield* Deferred.make<HttpClientRequest.HttpClientRequest>();
    const context = makeLayer({ queue, delivered });
    const { execute } = context;

    yield* withNotifications(
      context,
      Effect.gen(function* () {
        const notifications = yield* ConnectedDeviceNotifications;
        yield* notifications.start();
        yield* Queue.offer(queue, turnDiffCompletedEvent);
        const request = yield* Deferred.await(delivered).pipe(Effect.timeout(Duration.seconds(1)));

        expect(execute).toHaveBeenCalledTimes(1);
        expect(request.url).toBe("https://exp.host/--/api/v2/push/send");
        expect(parseJsonBody(request)).toEqual([
          {
            to: "ExponentPushToken[1]",
            sound: "default",
            title: "Chat finished",
            body: "Notification Thread: A chat finished running.",
            data: {
              threadId,
              event: "completed",
            },
          },
          {
            to: "ExponentPushToken[2]",
            sound: "default",
            title: "Chat finished",
            body: "Notification Thread: A chat finished running.",
            data: {
              threadId,
              event: "completed",
            },
          },
        ]);
      }),
    );
  }),
);

it.effect("ignores Expo delivery failures", () =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<OrchestrationEvent>();
    const delivered = yield* Deferred.make<HttpClientRequest.HttpClientRequest>();
    const context = makeLayer({ queue, delivered, status: 500 });

    yield* withNotifications(
      context,
      Effect.gen(function* () {
        const notifications = yield* ConnectedDeviceNotifications;
        yield* notifications.start();
        yield* Queue.offer(queue, turnDiffCompletedEvent);
        yield* Deferred.await(delivered).pipe(Effect.timeout(Duration.seconds(1)));
      }),
    );
  }),
);

it.effect("does not call Expo when no eligible push tokens exist", () =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<OrchestrationEvent>();
    const delivered = yield* Deferred.make<HttpClientRequest.HttpClientRequest>();
    const context = makeLayer({
      queue,
      delivered,
      sessions: [makeSession({ sessionId: "desktop-1", deviceType: "desktop", token: "token" })],
    });
    const { execute } = context;

    yield* withNotifications(
      context,
      Effect.gen(function* () {
        const notifications = yield* ConnectedDeviceNotifications;
        yield* notifications.start();
        yield* Queue.offer(queue, turnDiffCompletedEvent);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;

        expect(execute).not.toHaveBeenCalled();
      }),
    );
  }),
);
