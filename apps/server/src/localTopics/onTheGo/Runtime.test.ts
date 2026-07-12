import { describe, expect, it } from "vite-plus/test";
import { OnTheGoCommandId, OnTheGoDeviceId, OnTheGoRawAudioId } from "@t3tools/contracts";

import { makeDeterministicOnTheGoHarness } from "./testing.ts";

describe("OnTheGoRuntime", () => {
  it("OTG-UT-001: changes valid modes, rejects unavailable transitions, and keeps Off inert", () => {
    const harness = makeDeterministicOnTheGoHarness();

    expect(harness.runtime.snapshot(harness.scope)).toMatchObject({
      mode: "off",
      listener: "disabled",
      output: "disabled",
    });

    expect(
      harness.runtime.dispatch({
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-sleep"),
        mode: "sleep",
        source: "visual",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope)).toMatchObject({
      mode: "sleep",
      listener: "wake-only",
      output: "disabled",
    });

    expect(
      harness.runtime.dispatch({
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-theo-without-owner"),
        mode: "theo-conversation",
        source: "voice",
      }),
    ).toEqual({
      status: "rejected",
      commandId: OnTheGoCommandId.make("mode-theo-without-owner"),
      reason: "owner-required",
    });
    expect(harness.runtime.snapshot(harness.scope).mode).toBe("sleep");

    harness.capabilities.setModeAvailable("degraded", false);
    expect(
      harness.runtime.dispatch({
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-unavailable"),
        mode: "degraded",
        source: "visual",
      }),
    ).toMatchObject({ status: "rejected", reason: "unavailable-transition" });
    expect(harness.runtime.snapshot(harness.scope).mode).toBe("sleep");

    expect(
      harness.runtime.dispatch({
        type: "mode.set",
        commandId: OnTheGoCommandId.make("mode-off"),
        mode: "off",
        source: "visual",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope)).toMatchObject({
      mode: "off",
      listener: "disabled",
      output: "disabled",
    });
  });

  it("OTG-UT-002: permits one trusted owner and requires Continue after handoff or restart", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    const laptop = OnTheGoDeviceId.make("laptop");
    harness.deviceTrust.trust(phone);
    harness.deviceTrust.trust(laptop);

    expect(
      harness.runtime.dispatch({
        type: "owner.acquire",
        commandId: OnTheGoCommandId.make("owner-phone"),
        deviceId: phone,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).owner).toEqual({
      deviceId: phone,
      continueRequired: false,
    });

    expect(
      harness.runtime.dispatch({
        type: "owner.acquire",
        commandId: OnTheGoCommandId.make("owner-laptop-conflict"),
        deviceId: laptop,
      }),
    ).toMatchObject({ status: "rejected", reason: "owner-held" });
    expect(harness.runtime.snapshot(harness.scope).owner?.deviceId).toBe(phone);

    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("handoff-sleep"),
      mode: "sleep",
      source: "visual",
    });

    expect(
      harness.runtime.dispatch({
        type: "owner.handoff",
        commandId: OnTheGoCommandId.make("handoff-laptop"),
        deviceId: phone,
        nextDeviceId: laptop,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).owner).toEqual({
      deviceId: laptop,
      continueRequired: true,
    });

    expect(
      harness.runtime.dispatch({
        type: "wake.detected",
        commandId: OnTheGoCommandId.make("handoff-wake-before-continue"),
        deviceId: laptop,
        phrase: "T3",
      }),
    ).toMatchObject({ status: "rejected", reason: "continue-required" });
    expect(
      harness.runtime.dispatch({
        type: "owner.acquire",
        commandId: OnTheGoCommandId.make("reacquire-laptop"),
        deviceId: laptop,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).owner?.continueRequired).toBe(true);

    harness.restart();
    expect(harness.runtime.snapshot(harness.scope).owner).toEqual({
      deviceId: laptop,
      continueRequired: true,
    });

    expect(
      harness.runtime.dispatch({
        type: "owner.continue",
        commandId: OnTheGoCommandId.make("continue-laptop"),
        deviceId: laptop,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).owner?.continueRequired).toBe(false);
  });

  it("OTG-UT-003: activates calibrated wakes, rejects noise, and keeps Stop wake-free", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    harness.deviceTrust.trust(phone);
    harness.runtime.dispatch({
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("wake-owner"),
      deviceId: phone,
    });
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("wake-sleep"),
      mode: "sleep",
      source: "visual",
    });

    expect(
      harness.runtime.dispatch({
        type: "wake.detected",
        commandId: OnTheGoCommandId.make("wake-default"),
        deviceId: phone,
        phrase: "T3",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).mode).toBe("command");

    harness.wakeDetection.calibrate("Computer", "command", true);
    harness.wakeDetection.calibrate("background chatter", "command", false);
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("wake-sleep-again"),
      mode: "sleep",
      source: "visual",
    });
    expect(
      harness.runtime.dispatch({
        type: "wake.detected",
        commandId: OnTheGoCommandId.make("wake-noise"),
        deviceId: phone,
        phrase: "background chatter",
      }),
    ).toMatchObject({ status: "rejected", reason: "wake-not-recognized" });
    expect(harness.runtime.snapshot(harness.scope).mode).toBe("sleep");
    expect(
      harness.runtime.dispatch({
        type: "wake.detected",
        commandId: OnTheGoCommandId.make("wake-custom"),
        deviceId: phone,
        phrase: "Computer",
      }),
    ).toMatchObject({ status: "accepted" });

    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("wake-theo"),
      mode: "theo-conversation",
      source: "voice",
    });
    harness.audioOutput.speak("Current Theo response");
    harness.runtime.dispatch({
      type: "barge-in.set",
      commandId: OnTheGoCommandId.make("barge-off"),
      enabled: false,
    });
    expect(
      harness.runtime.dispatch({
        type: "speech.interrupt",
        commandId: OnTheGoCommandId.make("barge-noise"),
        deviceId: phone,
        phrase: "background conversation",
      }),
    ).toMatchObject({ status: "rejected", reason: "barge-in-disabled" });
    expect(harness.runtime.snapshot(harness.scope).output).toBe("enabled");
    expect(
      harness.runtime.dispatch({
        type: "speech.interrupt",
        commandId: OnTheGoCommandId.make("barge-stop"),
        deviceId: phone,
        phrase: "Stop",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).output).toBe("disabled");
    expect(harness.audioOutput.isSpeaking()).toBe(false);
  });

  it("OTG-UT-004: keeps dictation as correctable text and discards raw audio on every outcome", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    const firstAudio = OnTheGoRawAudioId.make("audio-1");
    const failedAudio = OnTheGoRawAudioId.make("audio-2");
    harness.deviceTrust.trust(phone);
    harness.runtime.dispatch({
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("dictation-owner"),
      deviceId: phone,
    });
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("dictation-mode"),
      mode: "dictation",
      source: "visual",
    });
    harness.rawAudio.add(firstAudio);
    harness.transcription.succeed(firstAudio, "send it after you fix the tests");

    expect(
      harness.runtime.dispatch({
        type: "dictation.capture",
        commandId: OnTheGoCommandId.make("dictation-first"),
        deviceId: phone,
        rawAudioId: firstAudio,
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.snapshot(harness.scope).dictation).toEqual({
      status: "ready",
      text: "send it after you fix the tests",
    });
    expect(harness.rawAudio.has(firstAudio)).toBe(false);

    harness.rawAudio.add(failedAudio);
    harness.transcription.fail(failedAudio);
    expect(
      harness.runtime.dispatch({
        type: "dictation.capture",
        commandId: OnTheGoCommandId.make("dictation-failed"),
        deviceId: phone,
        rawAudioId: failedAudio,
      }),
    ).toMatchObject({ status: "rejected", reason: "transcription-failed" });
    expect(harness.runtime.snapshot(harness.scope).dictation).toEqual({
      status: "error",
      text: "send it after you fix the tests",
    });
    expect(harness.rawAudio.has(failedAudio)).toBe(false);
  });

  it("OTG-UT-005: resolves safety phrases and aliases but rejects conflicts and non-catalog model output", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    const tablet = OnTheGoDeviceId.make("tablet");

    expect(
      harness.runtime.dispatch({
        type: "action.resolve",
        commandId: OnTheGoCommandId.make("resolve-while-off"),
        deviceId: phone,
        phrase: "STOP",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "invalid-state" });
    harness.deviceTrust.trust(phone);
    harness.deviceTrust.trust(tablet);
    harness.runtime.dispatch({
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("resolver-owner"),
      deviceId: phone,
    });
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("resolver-command-mode"),
      mode: "command",
      source: "visual",
    });

    expect(
      harness.runtime.dispatch({
        type: "action.resolve",
        commandId: OnTheGoCommandId.make("resolve-second-device"),
        deviceId: tablet,
        phrase: "stop",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "not-owner" });

    harness.audioOutput.speak("Current T3 response");
    expect(
      harness.runtime.dispatch({
        type: "action.resolve",
        commandId: OnTheGoCommandId.make("resolve-stop"),
        deviceId: phone,
        phrase: "STOP",
        source: "voice",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.events(harness.scope).at(-1)).toMatchObject({
      type: "action.resolved",
      action: "speech.stop",
      resolution: "local-safety",
    });
    expect(harness.audioOutput.isSpeaking()).toBe(false);

    expect(
      harness.runtime.dispatch({
        type: "vocabulary.alias.set",
        commandId: OnTheGoCommandId.make("alias-follow"),
        phrase: "keep me posted",
        action: "follow.start",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(
      harness.runtime.dispatch({
        type: "action.resolve",
        commandId: OnTheGoCommandId.make("resolve-follow"),
        deviceId: phone,
        phrase: "Keep me posted",
        source: "keyboard",
      }),
    ).toMatchObject({ status: "accepted" });
    expect(harness.runtime.events(harness.scope).at(-1)).toMatchObject({
      action: "follow.start",
      resolution: "alias",
      source: "keyboard",
    });

    expect(
      harness.runtime.dispatch({
        type: "vocabulary.alias.set",
        commandId: OnTheGoCommandId.make("alias-shadow-stop"),
        phrase: "stop",
        action: "follow.start",
      }),
    ).toMatchObject({ status: "rejected", reason: "immutable-phrase" });

    harness.commandModel.resolveAs("invent a command", "delete.everything");
    expect(
      harness.runtime.dispatch({
        type: "action.resolve",
        commandId: OnTheGoCommandId.make("resolve-invented"),
        deviceId: phone,
        phrase: "invent a command",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "action-not-cataloged" });
  });

  it("OTG-UT-006: authorizes the exact readback once and gives reciprocal controls the same contract", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    const tablet = OnTheGoDeviceId.make("tablet");
    harness.deviceTrust.trust(phone);
    harness.deviceTrust.trust(tablet);
    harness.runtime.dispatch({
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("confirmation-owner"),
      deviceId: phone,
    });
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("confirmation-command-mode"),
      mode: "command",
      source: "visual",
    });

    expect(
      harness.runtime.dispatch({
        type: "confirmation.request",
        commandId: OnTheGoCommandId.make("confirm-second-device-request"),
        deviceId: tablet,
        action: "agent.interrupt-and-replace",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "not-owner" });

    const first = harness.runtime.dispatch({
      type: "confirmation.request",
      commandId: OnTheGoCommandId.make("confirm-request-1"),
      deviceId: phone,
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    expect(first).toMatchObject({ status: "confirmation-required", target: "chat-1" });
    if (first.status !== "confirmation-required") throw new Error("confirmation was not created");

    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-second-device-response"),
        deviceId: tablet,
        confirmationId: first.confirmationId,
        phrase: "confirm",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "not-owner" });

    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-generic-yes"),
        deviceId: phone,
        confirmationId: first.confirmationId,
        phrase: "yes",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "confirmation-phrase-required" });
    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-after-generic-yes"),
        deviceId: phone,
        confirmationId: first.confirmationId,
        phrase: "confirm",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "confirmation-not-found" });

    const expiring = harness.runtime.dispatch({
      type: "confirmation.request",
      commandId: OnTheGoCommandId.make("confirm-expiring-request"),
      deviceId: phone,
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    if (expiring.status !== "confirmation-required") {
      throw new Error("confirmation was not created");
    }
    harness.clock.advanceBy(15_001);
    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-expired"),
        deviceId: phone,
        confirmationId: expiring.confirmationId,
        phrase: "confirm",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "confirmation-expired" });

    const changedTarget = harness.runtime.dispatch({
      type: "confirmation.request",
      commandId: OnTheGoCommandId.make("confirm-request-2"),
      deviceId: phone,
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    if (changedTarget.status !== "confirmation-required") {
      throw new Error("confirmation was not created");
    }
    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-target-changed"),
        deviceId: phone,
        confirmationId: changedTarget.confirmationId,
        phrase: "confirm",
        target: "chat-2",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "confirmation-target-changed" });

    const ambiguous = harness.runtime.dispatch({
      type: "confirmation.request",
      commandId: OnTheGoCommandId.make("confirm-ambiguous-request"),
      deviceId: phone,
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    if (ambiguous.status !== "confirmation-required") {
      throw new Error("confirmation was not created");
    }
    expect(
      harness.runtime.dispatch({
        type: "confirmation.respond",
        commandId: OnTheGoCommandId.make("confirm-ambiguous-response"),
        deviceId: phone,
        confirmationId: ambiguous.confirmationId,
        phrase: "confirm maybe",
        target: "chat-1",
        source: "voice",
      }),
    ).toMatchObject({ status: "rejected", reason: "confirmation-ambiguous" });

    const authorize = (source: "voice" | "visual" | "keyboard" | "touch") => {
      const request = harness.runtime.dispatch({
        type: "confirmation.request",
        commandId: OnTheGoCommandId.make(`confirm-${source}-request`),
        deviceId: phone,
        action: "agent.interrupt-and-replace",
        target: "chat-1",
        source,
      });
      if (request.status !== "confirmation-required")
        throw new Error("confirmation was not created");
      expect(
        harness.runtime.dispatch({
          type: "confirmation.respond",
          commandId: OnTheGoCommandId.make(`confirm-${source}-response`),
          deviceId: phone,
          confirmationId: request.confirmationId,
          phrase: "confirm",
          target: "chat-1",
          source,
        }),
      ).toMatchObject({ status: "accepted" });
      return harness.runtime.events(harness.scope).at(-1);
    };

    expect(authorize("voice")).toMatchObject({
      type: "action.authorized",
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    expect(authorize("visual")).toMatchObject({
      type: "action.authorized",
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "visual",
    });
    expect(authorize("keyboard")).toMatchObject({
      type: "action.authorized",
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "keyboard",
    });
    expect(authorize("touch")).toMatchObject({
      type: "action.authorized",
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "touch",
    });
  });

  it("requires an authorized read scope for snapshots and events", () => {
    const harness = makeDeterministicOnTheGoHarness();
    expect(harness.runtime.snapshot(harness.scope).mode).toBe("off");
    harness.authorization.deny(harness.scope);
    expect(() => harness.runtime.snapshot(harness.scope)).toThrow("not authorized");
    expect(() => harness.runtime.events(harness.scope)).toThrow("not authorized");
  });

  it("replays an idempotent disposition without authorizing a second side effect", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const phone = OnTheGoDeviceId.make("phone");
    harness.deviceTrust.trust(phone);
    harness.runtime.dispatch({
      type: "owner.acquire",
      commandId: OnTheGoCommandId.make("idempotent-owner"),
      deviceId: phone,
    });
    harness.runtime.dispatch({
      type: "mode.set",
      commandId: OnTheGoCommandId.make("idempotent-command-mode"),
      mode: "command",
      source: "visual",
    });
    const request = harness.runtime.dispatch({
      type: "confirmation.request",
      commandId: OnTheGoCommandId.make("idempotent-request"),
      deviceId: phone,
      action: "agent.interrupt-and-replace",
      target: "chat-1",
      source: "voice",
    });
    if (request.status !== "confirmation-required") throw new Error("confirmation was not created");
    const response = {
      type: "confirmation.respond" as const,
      commandId: OnTheGoCommandId.make("idempotent-response"),
      deviceId: phone,
      confirmationId: request.confirmationId,
      phrase: "confirm",
      target: "chat-1",
      source: "voice" as const,
    };

    expect(harness.runtime.dispatch(response)).toMatchObject({ status: "accepted" });
    expect(harness.runtime.events(harness.scope)).toHaveLength(1);
    expect(harness.runtime.dispatch(response)).toMatchObject({ status: "accepted" });
    expect(harness.runtime.events(harness.scope)).toHaveLength(1);

    harness.restart();
    expect(harness.runtime.dispatch(response)).toMatchObject({ status: "accepted" });
    expect(harness.runtime.events(harness.scope)).toHaveLength(0);
  });
});
