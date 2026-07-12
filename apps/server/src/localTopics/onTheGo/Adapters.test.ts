import { describe, expect, it } from "vite-plus/test";

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

    harness.contextFetch.allow("thread", "thread-1", "bounded evidence");
    expect(harness.contextFetch.fetch("thread", "thread-1")).toEqual({
      _tag: "Success",
      excerpt: "bounded evidence",
    });
    expect(harness.contextFetch.fetch("web", "blocked")).toEqual({ _tag: "Denied" });

    harness.connectivity.setOnline(false);
    expect(harness.connectivity.isOnline()).toBe(false);

    harness.turnDelivery.respondWith("queued");
    expect(
      harness.turnDelivery.deliver({
        target: "agent-1",
        intent: "queue",
        prompt: "Run the tests",
      }),
    ).toEqual({ disposition: "queued" });
    expect(harness.turnDelivery.deliveries()).toEqual([
      { target: "agent-1", intent: "queue", prompt: "Run the tests" },
    ]);
  });
});
