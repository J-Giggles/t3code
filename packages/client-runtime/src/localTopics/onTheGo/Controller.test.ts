import {
  OnTheGoDeviceId,
  OnTheGoResponseId,
  OnTheGoSubmissionId,
  OnTheGoVoiceSessionId,
  type OnTheGoCommand,
  type OnTheGoCommandDisposition,
  type OnTheGoSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeOnTheGoController } from "./Controller.ts";

const baseSnapshot = (): OnTheGoSnapshot =>
  ({
    mode: "off",
    listener: "disabled",
    output: "disabled",
    bargeInEnabled: true,
    dictation: { status: "idle", text: "" },
    vocabulary: [],
    lastResolvedAction: null,
    pendingConfirmation: null,
    owner: null,
    eventLog: [],
    foundation: {
      responses: [],
      attention: [],
      responseBadge: 0,
      attentionBadge: 0,
      selectedResponseId: null,
      pendingTurns: [],
      prompts: [],
      profileHistory: [],
      profileLayers: [],
      effectOutbox: [],
    },
  }) as unknown as OnTheGoSnapshot;

describe("On-the-Go client controller", () => {
  it("OTG-UT-003/005: uses configured wake phrases without changing the trusted server phrases", async () => {
    const deviceId = OnTheGoDeviceId.make("desktop-device");
    let snapshot = {
      ...baseSnapshot(),
      mode: "sleep" as const,
      owner: { deviceId, continueRequired: false },
    } as OnTheGoSnapshot;
    const wakes = new Array<string>();
    const controller = makeOnTheGoController({
      scope: { voiceSessionId: OnTheGoVoiceSessionId.make("session"), deviceId },
      target: () => null,
      createId: () => "id",
      voiceSettings: () => ({ wakePhrases: ["Computer", "Talk to Theo"] }),
      transport: {
        snapshot: async () => snapshot,
        dispatch: async (command) => {
          if (command.type === "wake.detected") wakes.push(command.phrase);
          if (command.type === "mode.set") snapshot = { ...snapshot, mode: command.mode };
          return { status: "accepted", commandId: command.commandId };
        },
        subscribe: () => () => undefined,
      },
      speech: {
        availability: () => ({ available: true, background: true }),
        start: () => () => undefined,
        speak: async () => undefined,
        stop: () => undefined,
      },
      theo: { ask: async () => ({ reply: "unused", preparedPrompt: null }) },
    });
    await controller.start();
    await controller.acceptTranscript("Talk to Theo");
    expect(controller.state().mode).toBe("theo-conversation");
    await controller.acceptTranscript("Back to commands");
    await controller.acceptTranscript("Computer what was the last announcement");
    expect(wakes).toEqual(["hey theo", "t3"]);
  });

  it("OTG-UT-021: drives the Core Voice Journey through the shared RPC and speech seams", async () => {
    let snapshot = baseSnapshot();
    const commands = new Array<OnTheGoCommand>();
    const spoken = new Array<string>();
    let transcriptListener: ((text: string) => void) | null = null;
    const deviceId = OnTheGoDeviceId.make("desktop-device");
    const controller = makeOnTheGoController({
      scope: {
        voiceSessionId: OnTheGoVoiceSessionId.make("desktop-session"),
        deviceId,
      },
      target: () => ({
        targetChatId: "chat-1",
        targetAgentId: "agent-1",
        activeTurnId: "turn-1",
      }),
      createId: (() => {
        let next = 0;
        return () => `client-${++next}`;
      })(),
      transport: {
        snapshot: async () => structuredClone(snapshot),
        dispatch: async (command): Promise<OnTheGoCommandDisposition> => {
          commands.push(command);
          if (command.type === "owner.acquire") {
            snapshot = { ...snapshot, owner: { deviceId, continueRequired: false } };
          }
          if (command.type === "mode.set") {
            snapshot = {
              ...snapshot,
              mode: command.mode,
              listener: command.mode === "off" ? "disabled" : "active",
              output: command.mode === "off" ? "disabled" : "enabled",
            };
          }
          if (command.type === "response.navigate") {
            snapshot = {
              ...snapshot,
              foundation: {
                ...snapshot.foundation,
                selectedResponseId: OnTheGoResponseId.make("response-1"),
              },
            };
          }
          if (command.type === "prompt.send") {
            snapshot = {
              ...snapshot,
              foundation: {
                ...snapshot.foundation,
                pendingTurns: [
                  {
                    submissionId: OnTheGoSubmissionId.make("submission-1"),
                    promptId: command.promptId,
                    revisionId: command.revisionId,
                    targetAgentId: "agent-1",
                    targetChatId: "chat-1",
                    contentHash: "hash-1",
                    intent: "queue",
                    source: command.source,
                    expectedActiveTurnId: command.expectedActiveTurnId,
                    state: "queued",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    correctionExpiresAt: "2026-01-01T00:00:10.000Z",
                    supersedes: null,
                    workspaceReady: true,
                    terminalAt: null,
                  },
                ],
              },
            };
          }
          if (command.type === "action.resolve") {
            snapshot = { ...snapshot, lastResolvedAction: "speech.stop" };
          }
          return { status: "accepted", commandId: command.commandId };
        },
        subscribe: () => () => undefined,
      },
      speech: {
        availability: () => ({ available: true, background: true }),
        start: (listener) => {
          transcriptListener = listener;
          return () => {
            transcriptListener = null;
          };
        },
        speak: async (text) => {
          spoken.push(text);
        },
        stop: () => undefined,
      },
      theo: {
        ask: async () => ({
          reply: "The agent finished the tests. I prepared a focused follow-up.",
          preparedPrompt: "Run the full test suite and report any regressions.",
        }),
      },
    });
    snapshot = {
      ...snapshot,
      foundation: {
        ...snapshot.foundation,
        responses: [
          {
            responseId: OnTheGoResponseId.make("response-1"),
            projectId: "project-1",
            chatId: "chat-1",
            agentId: "agent-1",
            outcome: "completed",
            safeSummary: "Focused tests passed",
            completedAt: "2026-01-01T00:00:00.000Z",
            handledAt: null,
            expiresAt: "2026-01-31T00:00:00.000Z",
          },
        ],
        responseBadge: 1,
      },
    };

    await controller.start();
    await controller.toggle(true);
    expect(transcriptListener).not.toBeNull();
    await controller.acceptTranscript("T3 what was the last announcement");
    expect(spoken).toContain("Focused tests passed");

    await controller.acceptTranscript("Hey Theo");
    await controller.acceptTranscript("What should we ask the coding agent next?");
    expect(controller.state().theoMessages.at(-1)?.text).toContain("prepared a focused follow-up");
    await controller.acceptTranscript(
      "Send this to a new agent with the context needed on this project",
    );
    expect(controller.state().caption).toContain("Prepared an isolated new agent");
    await controller.acceptTranscript("Send it");
    expect(commands.map((command) => command.type)).toEqual(
      expect.arrayContaining([
        "owner.acquire",
        "wake.detected",
        "response.navigate",
        "prompt.prepare",
        "prompt.mark-ready",
        "prompt.send",
        "agent.handoff.create",
      ]),
    );
    expect(controller.state().caption).toContain("This has been queued");
    await controller.acceptTranscript("No, steer the running agent");
    expect(commands.some((command) => command.type === "pending.correct-to-steer")).toBe(true);

    await controller.acceptTranscript("Map command halt voice to stop");
    expect(commands.some((command) => command.type === "vocabulary.alias.set")).toBe(true);
    snapshot = { ...snapshot, vocabulary: [{ phrase: "halt voice", action: "speech.stop" }] };
    expect(controller.state().mode).toBe("command");
    await controller.acceptTranscript("Halt voice");
    expect(commands.some((command) => command.type === "action.resolve")).toBe(true);
    expect(commands.some((command) => command.type === "speech.interrupt")).toBe(true);
    expect(controller.state().mode).toBe("sleep");
  });

  it("OTG-UT-002/003: refuses a second microphone and never enters a rejected wake state", async () => {
    const deviceId = OnTheGoDeviceId.make("desktop-device");
    let snapshot = {
      ...baseSnapshot(),
      mode: "sleep" as const,
      owner: { deviceId: OnTheGoDeviceId.make("other-device"), continueRequired: false },
    };
    let starts = 0;
    const controller = makeOnTheGoController({
      scope: { voiceSessionId: OnTheGoVoiceSessionId.make("session"), deviceId },
      target: () => null,
      createId: () => "id",
      transport: {
        snapshot: async () => snapshot,
        dispatch: async (command) => ({
          status: "rejected",
          commandId: command.commandId,
          reason: command.type === "wake.detected" ? "wake-not-recognized" : "not-owner",
        }),
        subscribe: () => () => undefined,
      },
      speech: {
        availability: () => ({ available: true, background: true }),
        start: () => {
          starts += 1;
          return () => undefined;
        },
        speak: async () => undefined,
        stop: () => undefined,
      },
      theo: { ask: async () => ({ reply: "unused", preparedPrompt: null }) },
    });
    await controller.start();
    await controller.toggle(true);
    expect(starts).toBe(0);
    expect(controller.state().caption).toContain("another device");

    snapshot = { ...snapshot, owner: { deviceId, continueRequired: false } };
    await controller.acceptTranscript("Hey Theo");
    expect(controller.state().mode).toBe("sleep");
    expect(controller.state().caption).toContain("did not activate");
  });

  it("OTG-UT-003/010: Stop invalidates an in-flight Theo result before speech or prompt preparation", async () => {
    const deviceId = OnTheGoDeviceId.make("desktop-device");
    const theoDeferred: {
      resolve?: (value: { reply: string; preparedPrompt: string | null }) => void;
    } = {};
    const spoken = new Array<string>();
    const commands = new Array<OnTheGoCommand>();
    const snapshot = {
      ...baseSnapshot(),
      mode: "theo-conversation" as const,
      owner: { deviceId, continueRequired: false },
    };
    const controller = makeOnTheGoController({
      scope: { voiceSessionId: OnTheGoVoiceSessionId.make("session"), deviceId },
      target: () => ({ targetChatId: "chat", targetAgentId: "agent" }),
      createId: () => "id",
      transport: {
        snapshot: async () => snapshot,
        dispatch: async (command) => {
          commands.push(command);
          return { status: "accepted", commandId: command.commandId };
        },
        subscribe: () => () => undefined,
      },
      speech: {
        availability: () => ({ available: true, background: true }),
        start: () => () => undefined,
        speak: async (text) => {
          spoken.push(text);
        },
        stop: () => undefined,
      },
      theo: {
        ask: () =>
          new Promise((resolve) => {
            theoDeferred.resolve = resolve;
          }),
      },
    });
    await controller.start();
    const pending = controller.acceptTranscript("Explain this response");
    await Promise.resolve();
    await controller.acceptTranscript("Stop");
    theoDeferred.resolve?.({ reply: "Late reply", preparedPrompt: "Late prompt" });
    await pending;
    expect(spoken).not.toContain("Late reply");
    expect(commands.some((command) => command.type === "prompt.prepare")).toBe(false);
  });
});
