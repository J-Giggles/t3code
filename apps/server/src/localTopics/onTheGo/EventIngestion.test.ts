import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { ingestOnTheGoEvent } from "./EventIngestion.ts";

describe("On-the-Go server-lifetime event ingestion", () => {
  it("OTG-UT-007/017/023: completes buffered assistant text and routes thread lifecycle facts", () => {
    const sink = {
      recordAgentCheckpoint: vi.fn(),
      recordAssistantResponse: vi.fn(),
      recordThreadLifecycle: vi.fn(),
    };
    const buffers = new Map<string, string>();
    const event = (value: unknown) => value as OrchestrationEvent;
    ingestOnTheGoEvent(
      sink,
      buffers,
      event({
        type: "thread.message-sent",
        eventId: "event-delta",
        payload: {
          threadId: "thread-1",
          messageId: "assistant-1",
          role: "assistant",
          text: "First ",
          streaming: true,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    ingestOnTheGoEvent(
      sink,
      buffers,
      event({
        type: "thread.message-sent",
        eventId: "event-complete",
        payload: {
          threadId: "thread-1",
          messageId: "assistant-1",
          role: "assistant",
          text: "response",
          streaming: false,
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      }),
    );
    ingestOnTheGoEvent(
      sink,
      buffers,
      event({
        type: "thread.archived",
        eventId: "event-archive",
        payload: { threadId: "thread-1" },
      }),
    );

    expect(sink.recordAssistantResponse).toHaveBeenCalledWith(
      expect.objectContaining({ text: "First ", threadId: "thread-1" }),
    );
    expect(sink.recordAgentCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "completed", summary: "First " }),
    );
    expect(sink.recordThreadLifecycle).toHaveBeenCalledWith({
      threadId: "thread-1",
      eventId: "event-archive",
      lifecycle: "archived",
    });
    expect(buffers).toEqual(new Map());
  });
});
