import { beforeEach, describe, expect, it } from "vitest";

import { FakeSummaryAdapter } from "../adapters/FakeSummaryAdapter";
import { createNotificationsStore } from "../state/notificationsStore";
import { createInMemoryPausedSessionsStore } from "../state/pausedSessionsStore";
import { FakeVoiceAdapter } from "../voice/FakeVoiceAdapter";
import { createOrchestrator, type OnTheGoFlowOrchestrator } from "./OnTheGoFlowOrchestrator";

describe("OnTheGoFlowOrchestrator skeleton", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
  });

  it("starts in idle state", () => {
    expect(orchestrator.state.value).toBe("idle");
  });

  it("history starts empty", () => {
    expect(orchestrator.history.value).toEqual([]);
  });

  it("caption starts empty", () => {
    expect(orchestrator.caption.value).toBe("");
  });
});
