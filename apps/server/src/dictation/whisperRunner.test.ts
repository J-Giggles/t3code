import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { startWhisperRunner, type WhisperRunner } from "./whisperRunner.ts";

class FakeStdin extends Writable {
  public chunks: Buffer[] = [];
  public allowWrite = true;
  override write(chunk: any, ...args: any[]): boolean {
    this.chunks.push(Buffer.from(chunk));
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    if (this.allowWrite) {
      cb?.();
      return true;
    }
    return false;
  }
  override _write(): void {
    /* unused — write() is overridden */
  }
}

interface FakeChild extends EventEmitter {
  stdin: FakeStdin;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = new FakeStdin();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function pcmFrame(): Buffer {
  return Buffer.alloc(800 * 2); // 50 ms at 16 kHz Int16
}

describe("startWhisperRunner", () => {
  it("emits partial events parsed from stdout", async () => {
    const child = makeFakeChild();
    const events: unknown[] = [];
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: (e) => events.push(e),
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    child.stdout.emit("data", "hello\r");
    expect(events).toEqual([{ kind: "partial", text: "hello" }]);
    runner.kill();
  });

  it("forwards Int16 frames to child stdin", async () => {
    const child = makeFakeChild();
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: () => {},
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    runner.writeFrame(pcmFrame());
    expect(child.stdin.chunks.length).toBe(1);
    expect(child.stdin.chunks[0]?.length).toBe(1600);
    runner.kill();
  });

  it("emits backpressure error when stdin stalls past timeout", async () => {
    vi.useFakeTimers();
    try {
      const child = makeFakeChild();
      child.stdin.allowWrite = false;
      const events: unknown[] = [];
      const runner = startWhisperRunner({
        spawn: () => child as never,
        binary: "/x",
        modelPath: "/m",
        onEvent: (e) => events.push(e),
        backpressureTimeoutMs: 500,
        idleTimeoutMs: 30_000,
        now: () => Date.now(),
      });
      runner.writeFrame(pcmFrame());
      vi.advanceTimersByTime(501);
      expect(events.some((e: any) => e.kind === "error" && e.code === "backpressure")).toBe(true);
      runner.kill();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits child-crashed when stdout EOF before stop", async () => {
    const child = makeFakeChild();
    const events: unknown[] = [];
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: (e) => events.push(e),
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    child.emit("exit", 1, null);
    expect(events.some((e: any) => e.kind === "error" && e.code === "child-crashed")).toBe(true);
    runner.kill();
  });

  it("graceful stop closes stdin and resolves on natural exit", async () => {
    const child = makeFakeChild();
    const runner: WhisperRunner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: () => {},
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    const stopped = runner.stop();
    setImmediate(() => child.emit("exit", 0, null));
    await stopped;
    // Verifies stop() awaits the exit event without timing out.
  });
});
