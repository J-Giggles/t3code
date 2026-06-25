import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import type * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { AuthSessionRepository } from "../../persistence/Services/AuthSessions.ts";
import {
  ConnectedDeviceNotifications,
  type ConnectedDeviceNotificationsShape,
} from "../Services/ConnectedDeviceNotifications.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type NotificationIntent = {
  readonly threadId: ThreadId;
  readonly title: string;
  readonly body: string;
  readonly event: "completed" | "error" | "input-required";
};

function intentFromEvent(event: OrchestrationEvent): NotificationIntent | null {
  if (event.type === "thread.turn-diff-completed") {
    return {
      threadId: event.payload.threadId,
      title: event.payload.status === "error" ? "Chat errored" : "Chat finished",
      body:
        event.payload.status === "error"
          ? "A chat finished with an error."
          : "A chat finished running.",
      event: event.payload.status === "error" ? "error" : "completed",
    };
  }

  if (event.type === "thread.session-set" && event.payload.session.status === "error") {
    return {
      threadId: event.payload.threadId,
      title: "Chat errored",
      body: event.payload.session.lastError ?? "A chat session hit an error.",
      event: "error",
    };
  }

  if (event.type !== "thread.activity-appended") {
    return null;
  }

  if (
    event.payload.activity.kind !== "approval.requested" &&
    event.payload.activity.kind !== "user-input.requested"
  ) {
    return null;
  }

  return {
    threadId: event.payload.threadId,
    title:
      event.payload.activity.kind === "approval.requested"
        ? "Chat needs approval"
        : "Chat needs input",
    body: event.payload.activity.summary,
    event: "input-required",
  };
}

export const makeConnectedDeviceNotifications = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const authSessions = yield* AuthSessionRepository;
  const httpClient = yield* HttpClient.HttpClient;

  const sendNotification = (intent: NotificationIntent) =>
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const sessions = yield* authSessions.listActive({ now });
      const tokens = Array.from(
        new Set(
          sessions.flatMap((session) =>
            (session.client.deviceType === "mobile" || session.client.deviceType === "tablet") &&
            session.pushNotificationPlatform === "expo" &&
            session.pushNotificationToken !== null
              ? [session.pushNotificationToken]
              : [],
          ),
        ),
      );

      if (tokens.length === 0) {
        return;
      }

      const thread = yield* projectionSnapshotQuery
        .getThreadShellById(intent.threadId)
        .pipe(Effect.orElseSucceed(() => Option.none()));
      const threadTitle =
        Option.isSome(thread) && thread.value.title.trim().length > 0
          ? thread.value.title
          : "T3 Code";

      const messages = tokens.map((to) => ({
        to,
        sound: "default",
        title: intent.title,
        body: `${threadTitle}: ${intent.body}`,
        data: {
          threadId: intent.threadId,
          event: intent.event,
        },
      }));

      const request = yield* HttpClientRequest.post(EXPO_PUSH_ENDPOINT).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJson(messages.length === 1 ? messages[0] : messages),
      );

      yield* httpClient.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.tapError((cause) =>
          Effect.logWarning("failed to send connected-device notification", { cause }),
        ),
        Effect.ignore,
      );
    }).pipe(
      Effect.catchCause((cause: Cause.Cause<unknown>) =>
        Effect.logWarning("connected-device notification skipped", { cause }),
      ),
    );

  const start: ConnectedDeviceNotificationsShape["start"] = () =>
    orchestrationEngine.streamDomainEvents.pipe(
      Stream.map(intentFromEvent),
      Stream.filter((intent): intent is NotificationIntent => intent !== null),
      Stream.runForEach(sendNotification),
      Effect.forkScoped,
      Effect.asVoid,
    );

  return { start } satisfies ConnectedDeviceNotificationsShape;
});

export const ConnectedDeviceNotificationsLive = Layer.effect(
  ConnectedDeviceNotifications,
  makeConnectedDeviceNotifications,
);
