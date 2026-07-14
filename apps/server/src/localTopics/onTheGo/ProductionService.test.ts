import {
  DEFAULT_ON_THE_GO_SETTINGS,
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
    const deviceBindings = new Map<string, string>();
    const readPersisted = () => persisted;
    const service = makeOnTheGoServerService({
      persistence: {
        load: () => persisted,
        save: (snapshot) => {
          persisted = structuredClone(snapshot);
        },
        loadDisposition: () => null,
        saveDisposition: () => undefined,
        loadDeviceBinding: (deviceId) => deviceBindings.get(deviceId) ?? null,
        saveDeviceBinding: (deviceId, sessionId) => deviceBindings.set(deviceId, sessionId),
      },
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const scope = {
      voiceSessionId: OnTheGoVoiceSessionId.make("voice-a"),
      deviceId: OnTheGoDeviceId.make("device-a"),
    };
    service.connect("auth-a", scope);
    expect(() => service.connect("auth-b", scope)).toThrow(
      "active in another authenticated session",
    );
    expect(() =>
      service.connect("auth-a", {
        ...scope,
        deviceId: OnTheGoDeviceId.make("different-device"),
      }),
    ).toThrow("already bound");

    expect(
      service.dispatchClient("auth-a", {
        type: "owner.acquire",
        commandId: OnTheGoCommandId.make("owner-a"),
        deviceId: scope.deviceId,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      service.dispatchClient("auth-a", {
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-a"),
        mode: "sleep",
        source: "visual",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(service.snapshot("auth-a", scope).owner?.deviceId).toBe(scope.deviceId);
    expect(() => service.snapshot("auth-b", scope)).toThrow("On-the-Go scope is not authorized");
    expect(service.consumeRemoteModelCall("auth-b", scope, { warningAt: 1, hardLimit: 2 })).toEqual(
      { allowed: false, used: 0, reason: "policy-denied" },
    );
    expect(service.consumeRemoteModelCall("auth-a", scope, { warningAt: 1, hardLimit: 2 })).toEqual(
      { allowed: true, used: 1, warning: true },
    );
    expect(service.consumeRemoteModelCall("auth-a", scope, { warningAt: 1, hardLimit: 2 })).toEqual(
      { allowed: true, used: 2, warning: true },
    );
    expect(service.consumeRemoteModelCall("auth-a", scope, { warningAt: 1, hardLimit: 2 })).toEqual(
      { allowed: false, used: 2, reason: "budget-exhausted" },
    );
    service.configureModelPolicy({
      ...DEFAULT_ON_THE_GO_SETTINGS,
      fallbackModels: {
        transcription: [],
        speech: [],
        reasoning: [{ providerId: "claudeAgent", modelId: "approved", capability: "reasoning" }],
      },
    });
    expect(
      service.dispatchClient("auth-a", {
        type: "model.use",
        commandId: OnTheGoCommandId.make("model-approved-fallback"),
        deviceId: scope.deviceId,
        capability: "reasoning",
        providerId: "claudeAgent",
        modelId: "approved",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      service.dispatchClient("auth-a", {
        type: "model.use",
        commandId: OnTheGoCommandId.make("model-unapproved-fallback"),
        deviceId: scope.deviceId,
        capability: "reasoning",
        providerId: "unknown",
        modelId: "not-approved",
      }),
    ).toMatchObject({ status: "rejected", reason: "fallback-not-approved" });
    expect(
      service.recordContextEvidence({
        deviceId: OnTheGoDeviceId.make("other-device"),
        source: "project-workspace",
        reference: "README.md",
        sourceVersion: "1",
        ownerScope: `${scope.voiceSessionId}:${scope.deviceId}`,
        excerpt: "Authorized evidence",
      }),
    ).toMatchObject({ status: "rejected", reason: "device-untrusted" });
    expect(
      service.recordContextEvidence({
        deviceId: scope.deviceId,
        source: "project-workspace",
        reference: "README.md",
        sourceVersion: "1",
        ownerScope: `${scope.voiceSessionId}:${scope.deviceId}`,
        excerpt: "Authorized evidence",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(service.snapshot("auth-a", scope).foundation.contextEvidence[0]).toMatchObject({
      source: "project-workspace",
      reference: "README.md",
    });
    expect(JSON.stringify(service.snapshot("auth-a", scope))).not.toContain("Authorized evidence");

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
    service.disconnect("auth-a");
    expect(() => service.connect("auth-b", scope)).toThrow(
      "belongs to another authenticated session",
    );
  });

  it("OTG-UT-012/015: requires a real completion before advancing one durable queue head", async () => {
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

    now = "2026-01-01T00:01:00.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    expect(delivered).toEqual([]);
    now = "2026-01-01T00:00:00.000Z";
    service.recordAssistantResponse({
      threadId: "thread-delivery",
      messageId: "real-completion",
      text: "The active coding turn completed.",
      completedAt: now,
    });
    expect(delivered).toEqual([]);
    now = "2026-01-01T00:00:10.002Z";
    await vi.advanceTimersByTimeAsync(10_002);
    expect(delivered).toEqual(["Run the focused checks"]);
    expect(service.snapshot("auth-delivery", scope).foundation.pendingTurns[0]?.state).toBe(
      "dispatched",
    );
  });

  it("OTG-UT-008/016: classifies provider approval and failure checkpoints as blocking outcomes", () => {
    let persisted: OnTheGoSnapshot | null = null;
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
      voiceSessionId: OnTheGoVoiceSessionId.make("voice-outcome"),
      deviceId: OnTheGoDeviceId.make("device-outcome"),
    };
    service.connect("auth-outcome", scope);
    service.dispatchClient("auth-outcome", {
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("owner-outcome"),
      deviceId: scope.deviceId,
    });
    service.recordAgentCheckpoint({
      checkpointId: "approval-1",
      chatId: "thread-outcome",
      kind: "approval",
      summary: "Approval is required before running the command.",
      evidence: "activity:approval-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    service.recordAssistantResponse({
      threadId: "thread-outcome",
      messageId: "assistant-before-approval",
      text: "I need approval to continue.",
      completedAt: "2026-01-01T00:00:01.000Z",
    });

    const foundation = service.snapshot("auth-outcome", scope).foundation;
    expect(foundation.responses[0]?.outcome).toBe("decision-required");
    expect(foundation.attention[0]).toMatchObject({
      chatId: "thread-outcome",
      kind: "input",
    });
    expect(foundation.frozenAgents).toContain("thread-outcome");
  });
});
