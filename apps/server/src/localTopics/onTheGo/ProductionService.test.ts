import {
  OnTheGoCommandId,
  OnTheGoDeviceId,
  OnTheGoPromptId,
  OnTheGoPromptRevisionId,
  OnTheGoResponseId,
  OnTheGoVoiceSessionId,
  type OnTheGoSnapshot,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makeOnTheGoServerService, safeAnnouncementSummary } from "./ProductionService.ts";

describe("On-the-Go production service", () => {
  afterEach(() => vi.useRealTimers());

  it("OTG-UT-009: removes code, stack output, and credential-shaped content from speech", () => {
    expect(
      safeAnnouncementSummary(
        "Implemented the dock.\n```ts\nconst token = 'raw';\n```\napi_key=do-not-speak\nat worker.ts:10",
      ),
    ).toBe("Implemented the dock.");
    expect(safeAnnouncementSummary("```sh\nsecret=hidden\n```")).toContain("safe spoken summary");
  });

  it("OTG-UT-023: binds one authenticated session to dispatch, snapshot, and ordered-event seams", () => {
    let persisted: OnTheGoSnapshot | null = null;
    const readPersisted = () => persisted;
    const service = makeOnTheGoServerService({
      persistence: {
        load: () => persisted,
        save: (snapshot) => {
          persisted = structuredClone(snapshot);
        },
        loadDisposition: () => null,
        saveDisposition: () => undefined,
      },
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const scope = {
      voiceSessionId: OnTheGoVoiceSessionId.make("voice-a"),
      deviceId: OnTheGoDeviceId.make("device-a"),
    };
    service.connect("auth-a", scope);

    expect(
      service.dispatchClient("auth-a", {
        type: "owner.acquire",
        commandId: OnTheGoCommandId.make("owner-a"),
        deviceId: scope.deviceId,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(service.snapshot("auth-a", scope).owner?.deviceId).toBe(scope.deviceId);
    expect(() => service.snapshot("auth-b", scope)).toThrow("On-the-Go scope is not authorized");

    expect(
      service.dispatchClient("auth-a", {
        type: "response.record",
        commandId: OnTheGoCommandId.make("untrusted-system-event"),
        deviceId: scope.deviceId,
        response: {
          responseId: OnTheGoResponseId.make("response-a"),
          projectId: "project-a",
          chatId: "chat-a",
          agentId: "agent-a",
          outcome: "completed",
          safeSummary: "Tests passed",
          completedAt: "2026-01-01T00:00:00.000Z",
          handledAt: null,
          expiresAt: "2026-01-31T00:00:00.000Z",
        },
      }),
    ).toMatchObject({ status: "rejected", reason: "policy-denied" });
    const streamed = new Array<number>();
    const unsubscribe = service.subscribe("auth-a", scope, (event) => {
      streamed.push(event.sequence);
    });
    service.dispatchSystem({
      type: "response.record",
      commandId: OnTheGoCommandId.make("trusted-system-event"),
      deviceId: scope.deviceId,
      response: {
        responseId: OnTheGoResponseId.make("response-a"),
        projectId: "project-a",
        chatId: "chat-a",
        agentId: "agent-a",
        outcome: "completed",
        safeSummary: "Tests passed",
        completedAt: "2026-01-01T00:00:00.000Z",
        handledAt: null,
        expiresAt: "2026-01-31T00:00:00.000Z",
      },
    });
    expect(service.events("auth-a", scope).map((event) => event.sequence)).toEqual([0]);
    expect(streamed).toEqual([0]);
    unsubscribe();
    expect(readPersisted()?.eventLog).toHaveLength(1);
  });

  it("OTG-UT-012/015: executes one durable ready revision only after the correction window", async () => {
    vi.useFakeTimers();
    let now = "2026-01-01T00:00:00.000Z";
    let persisted: OnTheGoSnapshot | null = null;
    const delivered = new Array<string>();
    const service = makeOnTheGoServerService({
      persistence: {
        load: () => persisted,
        save: (snapshot) => {
          persisted = structuredClone(snapshot);
        },
        loadDisposition: () => null,
        saveDisposition: () => undefined,
      },
      now: () => now,
    });
    const scope = {
      voiceSessionId: OnTheGoVoiceSessionId.make("voice-delivery"),
      deviceId: OnTheGoDeviceId.make("device-delivery"),
    };
    service.connect("auth-delivery", scope);
    service.setTurnExecutor(async (request) => {
      delivered.push(request.prompt);
    });
    const ownerDisposition = service.dispatchClient("auth-delivery", {
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("owner-delivery"),
      deviceId: scope.deviceId,
    });
    expect(ownerDisposition).toEqual({
      status: "accepted",
      commandId: OnTheGoCommandId.make("owner-delivery"),
    });
    expect(
      service.dispatchClient("auth-delivery", {
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-delivery"),
        mode: "command",
        source: "visual",
      }),
    ).toMatchObject({ status: "accepted" });
    const promptId = OnTheGoPromptId.make("prompt-delivery");
    const revisionId = OnTheGoPromptRevisionId.make("revision-delivery");
    expect(
      service.dispatchClient("auth-delivery", {
        type: "prompt.prepare",
        commandId: OnTheGoCommandId.make("prepare-delivery"),
        deviceId: scope.deviceId,
        promptId,
        revisionId,
        content: "Run the focused checks",
        targetChatId: "thread-delivery",
        targetAgentId: "thread-delivery",
        requiresWorkspace: false,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      service.dispatchClient("auth-delivery", {
        type: "prompt.mark-ready",
        commandId: OnTheGoCommandId.make("ready-delivery"),
        deviceId: scope.deviceId,
        promptId,
        revisionId,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      service.dispatchClient("auth-delivery", {
        type: "prompt.send",
        commandId: OnTheGoCommandId.make("send-delivery"),
        deviceId: scope.deviceId,
        promptId,
        revisionId,
        phrase: "send it",
        intent: "queue",
        source: "voice",
        expectedActiveTurnId: null,
      }),
    ).toMatchObject({ status: "accepted" });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(delivered).toEqual([]);
    now = "2026-01-01T00:00:10.002Z";
    await vi.advanceTimersByTimeAsync(2);
    expect(delivered).toEqual(["Run the focused checks"]);
    expect(service.snapshot("auth-delivery", scope).foundation.pendingTurns[0]?.state).toBe(
      "dispatched",
    );
  });
});
