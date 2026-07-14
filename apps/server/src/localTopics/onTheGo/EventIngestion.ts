import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as OrchestrationEngine from "../../orchestration/Services/OrchestrationEngine.ts";
import { classifyProviderActivity } from "./ProviderCheckpoint.ts";
import {
  assertOnTheGoIntegrationContract,
  ON_THE_GO_INTEGRATION_CONTRACT,
} from "./IntegrationContract.ts";
import { OnTheGoProductionService } from "./ProductionLayer.ts";
import type { OnTheGoServerService } from "./ProductionService.ts";

type EventSink = Pick<
  OnTheGoServerService,
  "recordAgentCheckpoint" | "recordAssistantResponse" | "recordThreadLifecycle"
>;

/** Server-lifetime projection from orchestration facts into the durable voice companion. */
export const ingestOnTheGoEvent = (
  sink: EventSink,
  assistantBuffers: Map<string, string>,
  event: OrchestrationEvent,
) => {
  if (event.type === "thread.archived" || event.type === "thread.deleted") {
    sink.recordThreadLifecycle({
      threadId: event.payload.threadId,
      eventId: event.eventId,
      lifecycle: event.type === "thread.archived" ? "archived" : "deleted",
    });
    return;
  }
  if (event.type === "thread.turn-start-requested") {
    sink.recordAgentCheckpoint({
      checkpointId: event.eventId,
      chatId: event.payload.threadId,
      kind: "started",
      summary: "The coding agent started a new turn.",
      evidence: `event:${event.eventId}`,
      occurredAt: event.occurredAt,
    });
    return;
  }
  if (event.type === "thread.turn-diff-completed") {
    const fileCount = event.payload.files.length;
    sink.recordAgentCheckpoint({
      checkpointId: event.eventId,
      chatId: event.payload.threadId,
      kind: fileCount > 0 ? "file-changed" : "progress",
      summary:
        fileCount > 0
          ? `The coding agent checkpoint changed ${fileCount} file${fileCount === 1 ? "" : "s"}.`
          : "The coding agent recorded a checkpoint with no file changes.",
      evidence: `checkpoint:${event.payload.checkpointRef}`,
      occurredAt: event.payload.completedAt,
    });
    return;
  }
  if (event.type === "thread.activity-appended") {
    const activity = event.payload.activity;
    const kind = classifyProviderActivity(activity);
    if (!kind) return;
    sink.recordAgentCheckpoint({
      checkpointId: event.eventId,
      chatId: event.payload.threadId,
      kind,
      summary: activity.summary,
      evidence: `activity:${activity.id}`,
      occurredAt: activity.createdAt,
    });
    return;
  }
  if (event.type !== "thread.message-sent" || event.payload.role !== "assistant") return;
  const messageId = event.payload.messageId;
  if (event.payload.streaming) {
    assistantBuffers.set(
      messageId,
      `${assistantBuffers.get(messageId) ?? ""}${event.payload.text}`,
    );
    return;
  }
  const text = assistantBuffers.get(messageId) ?? event.payload.text;
  sink.recordAssistantResponse({
    threadId: event.payload.threadId,
    messageId,
    text,
    completedAt: event.payload.updatedAt,
  });
  sink.recordAgentCheckpoint({
    checkpointId: `assistant:${messageId}`,
    chatId: event.payload.threadId,
    kind: "completed",
    summary: text,
    evidence: `message:${messageId}`,
    occurredAt: event.payload.updatedAt,
  });
  assistantBuffers.delete(messageId);
};

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    assertOnTheGoIntegrationContract(ON_THE_GO_INTEGRATION_CONTRACT);
    const sink = yield* OnTheGoProductionService;
    const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
    const assistantBuffers = new Map<string, string>();
    yield* orchestrationEngine.streamDomainEvents.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => ingestOnTheGoEvent(sink, assistantBuffers, event)),
      ),
      Effect.forkScoped,
    );
  }),
);
