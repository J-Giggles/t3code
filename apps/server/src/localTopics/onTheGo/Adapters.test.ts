import { describe, expect, it } from "vite-plus/test";
import { OnTheGoSubmissionId } from "@t3tools/contracts";

import { makeDeterministicOnTheGoHarness } from "./testing.ts";

describe("deterministic On-the-Go adapters", () => {
  it("provides controllable fakes for every accepted production port", () => {
    const harness = makeDeterministicOnTheGoHarness();

    harness.audioOutput.speak("Theo summary");
    expect(harness.audioOutput.spoken()).toEqual(["Theo summary"]);
    harness.audioOutput.stop();
    expect(harness.audioOutput.isSpeaking()).toBe(false);

    harness.audioFocus.set("call");
    expect(harness.audioFocus.current()).toBe("call");

    harness.theoModel.respondTo("summarize", "Two tests passed.");
    expect(harness.theoModel.generate("summarize")).toEqual({
      _tag: "Success",
      text: "Two tests passed.",
    });

    harness.providerCheckpoints.emit({
      kind: "tests-passed",
      sourceId: "checkpoint-1",
      summary: "Two tests passed",
    });
    expect(harness.providerCheckpoints.read()).toHaveLength(1);

    harness.contextFetch.allow("thread", "thread-1", "bounded evidence", "chat-1");
    expect(harness.contextFetch.fetch("thread", "thread-1")).toEqual({
      _tag: "Success",
      excerpt: "bounded evidence",
      ownerScope: "chat-1",
    });
    expect(harness.contextFetch.fetch("web", "blocked")).toEqual({
      _tag: "Denied",
      reason: "authorization",
    });

    harness.connectivity.setOnline(false);
    expect(harness.connectivity.isOnline()).toBe(false);

    harness.turnDelivery.respondWith("queued");
    expect(
      harness.turnDelivery.deliver({
        submissionId: OnTheGoSubmissionId.make("submission-1"),
        target: "agent-1",
        targetAgentId: "agent-1",
        intent: "queue",
        prompt: "Run the tests",
        expectedActiveTurnId: null,
        source: "voice",
      }),
    ).toEqual({ disposition: "queued" });
    expect(harness.turnDelivery.deliveries()).toEqual([
      {
        submissionId: OnTheGoSubmissionId.make("submission-1"),
        target: "agent-1",
        targetAgentId: "agent-1",
        intent: "queue",
        prompt: "Run the tests",
        expectedActiveTurnId: null,
        source: "voice",
      },
    ]);
  });
});
