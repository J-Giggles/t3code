import {
  type DictationAudioFrameInput,
  type DictationCapability,
  DictationError,
  type DictationStartInput,
  type DictationStartResult,
  type DictationStopInput,
  type DictationStreamEvent,
} from "@t3tools/contracts";
import { Effect, PubSub, Stream } from "effect";
import type { WhisperRunner, WhisperRunnerEvent } from "./whisperRunner.ts";

export interface DictationServiceDeps {
  capability: DictationCapability;
  startRunner: (opts: {
    onEvent: (e: WhisperRunnerEvent) => void;
    language: string | null;
  }) => WhisperRunner;
  newSessionId: () => string;
  warmPoolIdleMs: number;
}

export interface DictationService {
  startSession(input: DictationStartInput): Effect.Effect<DictationStartResult, DictationError>;
  writeFrame(input: DictationAudioFrameInput): Effect.Effect<void, DictationError>;
  stopSession(input: DictationStopInput): Effect.Effect<void, DictationError>;
  events: Stream.Stream<DictationStreamEvent>;
  shutdown(): Effect.Effect<void>;
}

interface ActiveSession {
  sessionId: string;
  runner: WhisperRunner;
  lastPartial: string | null;
}

export function makeDictationService(deps: DictationServiceDeps): DictationService {
  const pubsub = Effect.runSync(PubSub.unbounded<DictationStreamEvent>());
  let active: ActiveSession | null = null;
  let warm: WhisperRunner | null = null;
  let warmTimer: NodeJS.Timeout | null = null;

  function publishSync(event: DictationStreamEvent): void {
    Effect.runSync(PubSub.publish(pubsub, event));
  }

  // Stable runner-event handler. The runner's `onEvent` is set once at
  // construction time; routing must read `active.sessionId` at emission time
  // so a warm-pool runner reused for a new session emits events under the
  // current session's ID. Late events arriving after `stopSession` cleared
  // `active` (or during a warm-pool gap before the next start) are dropped.
  const onRunnerEvent = (event: WhisperRunnerEvent): void => {
    if (!active) return;
    const sessionId = active.sessionId;
    if (event.kind === "partial") {
      active.lastPartial = event.text;
      publishSync({ type: "partial", sessionId, text: event.text });
    } else if (event.kind === "commit") {
      active.lastPartial = null;
      publishSync({ type: "commit", sessionId, text: event.text });
    } else if (event.kind === "error") {
      publishSync({
        type: "error",
        sessionId,
        code: event.code,
        message: event.message,
      });
    }
  };

  function acquireRunner(language: string | null): WhisperRunner {
    if (warm) {
      const reused = warm;
      warm = null;
      if (warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
      // No re-binding: the existing onRunnerEvent reads active.sessionId.
      return reused;
    }
    return deps.startRunner({ onEvent: onRunnerEvent, language });
  }

  function startSession(
    input: DictationStartInput,
  ): Effect.Effect<DictationStartResult, DictationError> {
    return Effect.suspend(() => {
      if (active) {
        return Effect.fail(
          new DictationError({
            code: "internal",
            message: "session already active for this WS",
            sessionId: null,
          }),
        );
      }
      if (!deps.capability.available || !deps.capability.modelLabel) {
        return Effect.fail(
          new DictationError({
            code: "internal",
            message: deps.capability.reason ?? "dictation unavailable",
            sessionId: null,
          }),
        );
      }
      const sessionId = deps.newSessionId();
      const runner = acquireRunner(input.language);
      active = { sessionId, runner, lastPartial: null };
      publishSync({
        type: "started",
        sessionId,
        modelLabel: deps.capability.modelLabel,
      });
      return Effect.succeed({
        sessionId,
        modelLabel: deps.capability.modelLabel,
      });
    });
  }

  function writeFrame(input: DictationAudioFrameInput): Effect.Effect<void, DictationError> {
    return Effect.sync(() => {
      // Silently drop frames for unknown / mismatched sessions per the wire
      // protocol: the client always recovers via the next `dictation.start`.
      if (!active || active.sessionId !== input.sessionId) return;
      const frame = Buffer.from(input.pcm, "base64");
      active.runner.writeFrame(frame);
    });
  }

  function stopSession(input: DictationStopInput): Effect.Effect<void, DictationError> {
    return Effect.promise(async () => {
      // Silent no-op for stale stop requests, matching the writeFrame policy.
      if (!active || active.sessionId !== input.sessionId) return;
      const session = active;
      // Clear `active` BEFORE awaiting runner.stop() so any late
      // parser.feed events emitted by the runner (e.g. flushed on graceful
      // exit) don't get routed under a session ID we already stopped.
      active = null;
      // Promote any pending partial to a commit before tearing down.
      // The runner's parser.flush() may also emit a commit on graceful
      // exit; the wire client coalesces both via the anchor model.
      if (session.lastPartial && session.lastPartial.length > 0) {
        publishSync({
          type: "commit",
          sessionId: session.sessionId,
          text: session.lastPartial,
        });
      }
      await session.runner.stop();
      publishSync({
        type: "stopped",
        sessionId: session.sessionId,
        reason: "client-stop",
      });
      // Warm pool of one: hold the runner idle for warmPoolIdleMs, then kill.
      warm = session.runner;
      warmTimer = setTimeout(() => {
        warm?.kill();
        warm = null;
        warmTimer = null;
      }, deps.warmPoolIdleMs);
    });
  }

  function shutdown(): Effect.Effect<void> {
    return Effect.sync(() => {
      active?.runner.kill();
      active = null;
      warm?.kill();
      warm = null;
      if (warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
    });
  }

  return {
    startSession,
    writeFrame,
    stopSession,
    events: Stream.fromPubSub(pubsub),
    shutdown,
  };
}
