import { Effect, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeDictationService, type DictationServiceDeps } from "./dictationService.ts";
import type { WhisperRunner, WhisperRunnerEvent } from "./whisperRunner.ts";

function fakeRunner(): WhisperRunner & { __emit: (e: WhisperRunnerEvent) => void } {
  let onEvent: ((e: WhisperRunnerEvent) => void) | null = null;
  const runner = {
    writeFrame: vi.fn(),
    stop: vi.fn(async () => {}),
    kill: vi.fn(),
    __emit: (e: WhisperRunnerEvent) => onEvent?.(e),
    __setEvent: (fn: (e: WhisperRunnerEvent) => void) => (onEvent = fn),
  };
  return runner as never;
}

const deps = (overrides?: Partial<DictationServiceDeps>): DictationServiceDeps => ({
  capability: () => ({
    available: true,
    reason: null,
    modelLabel: "ggml-base.en",
    modelPath: "/home/user/.cache/whisper/ggml-base.en.bin",
    binaryPath: "/usr/bin/whisper-cli",
  }),
  startRunner: vi.fn(),
  newSessionId: () => "sess_1",
  warmPoolIdleMs: 30_000,
  ...overrides,
});

describe("dictationService", () => {
  it("startSession returns sessionId and modelLabel and emits started", async () => {
    const runner = fakeRunner();
    const startRunner = vi.fn(() => runner);
    const service = makeDictationService(deps({ startRunner: startRunner as never }));
    const events: unknown[] = [];
    const sub = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Stream.runForEach(service.events, (e) =>
            Effect.sync(() => events.push(e)),
          ).pipe(Effect.forkScoped);
          // Yield so the consumer fiber subscribes to the PubSub before we
          // publish — `Stream.fromPubSub` defers `PubSub.subscribe` until
          // stream start, so a publish before that point is dropped.
          yield* Effect.yieldNow;
          const result = yield* service.startSession({
            threadId: "thread_x" as never,
            language: null,
          });
          // Yield once more to let the consumer fiber drain the published
          // event before the scope closes and the fiber is interrupted.
          yield* Effect.yieldNow;
          return { result, fiber };
        }),
      ),
    );
    expect(sub.result).toEqual({ sessionId: "sess_1", modelLabel: "ggml-base.en" });
    expect(events.some((e: any) => e.type === "started")).toBe(true);
  });

  it("audioFrame forwards decoded base64 to runner.writeFrame", async () => {
    const runner = fakeRunner();
    const service = makeDictationService(deps({ startRunner: () => runner as never }));
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* service.startSession({ threadId: "t" as never, language: null });
        yield* service.writeFrame({
          sessionId: "sess_1" as never,
          seq: 0,
          pcm: Buffer.alloc(1600).toString("base64"),
        });
      }),
    );
    expect(runner.writeFrame).toHaveBeenCalledOnce();
    const arg = (runner.writeFrame as any).mock.calls[0][0] as Buffer;
    expect(arg.length).toBe(1600);
  });

  it("stop emits stopped and keeps runner warm for next session", async () => {
    const runner = fakeRunner();
    const startRunner = vi.fn(() => runner as never);
    const service = makeDictationService(deps({ startRunner }));
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* service.startSession({ threadId: "t" as never, language: null });
        yield* service.stopSession({ sessionId: "sess_1" as never, reason: "user" });
        yield* service.startSession({ threadId: "t" as never, language: null });
      }),
    );
    expect(startRunner).toHaveBeenCalledOnce();
    expect(runner.stop).toHaveBeenCalledOnce();
    expect(runner.kill).not.toHaveBeenCalled();
  });

  it("kills warm runner after warmPoolIdleMs", async () => {
    vi.useFakeTimers();
    try {
      const runner = fakeRunner();
      const service = makeDictationService(
        deps({ startRunner: () => runner as never, warmPoolIdleMs: 100 }),
      );
      await Effect.runPromise(service.startSession({ threadId: "t" as never, language: null }));
      await Effect.runPromise(
        service.stopSession({ sessionId: "sess_1" as never, reason: "user" }),
      );
      vi.advanceTimersByTime(150);
      expect(runner.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
