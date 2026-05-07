import type { ChildProcess } from "node:child_process";
import { makeWhisperStdoutParser } from "./whisperStdoutParser.ts";

/**
 * Runner-internal events. Note that this internal event uses `kind`, whereas
 * the wire-facing `DictationStreamEvent` (in `@t3tools/contracts/dictation`)
 * uses `type`. The conversion happens in `dictationService` at the wire boundary.
 */
export type WhisperRunnerEvent =
  | { kind: "partial"; text: string }
  | { kind: "commit"; text: string }
  | { kind: "error"; code: "backpressure" | "child-crashed" | "spawn-failed"; message: string };

export interface WhisperRunner {
  writeFrame(frame: Buffer): void;
  stop(): Promise<void>;
  kill(): void;
}

export interface WhisperRunnerOptions {
  spawn: (binary: string, args: readonly string[]) => ChildProcess;
  binary: string;
  modelPath: string;
  onEvent: (event: WhisperRunnerEvent) => void;
  backpressureTimeoutMs: number;
  stopTimeoutMs?: number;
  now: () => number;
  language?: string | null;
}

export function startWhisperRunner(options: WhisperRunnerOptions): WhisperRunner {
  const args = [
    "--stream",
    "-m",
    options.modelPath,
    "-c",
    "0",
    "-f",
    "-",
    ...(options.language ? ["-l", options.language] : []),
  ];
  let killed = false;
  let pendingWriteSince: number | null = null;
  let backpressureTimer: NodeJS.Timeout | null = null;
  const child = options.spawn(options.binary, args);
  const parser = makeWhisperStdoutParser();

  child.stdout?.setEncoding?.("utf8");
  child.stdout?.on("data", (chunk: string) => {
    for (const event of parser.feed(chunk)) options.onEvent(event);
  });

  let exitResolver: ((value: void) => void) | null = null;
  let stopStdinTimer: NodeJS.Timeout | null = null;
  let stopForceTimer: NodeJS.Timeout | null = null;
  child.on("exit", (code) => {
    if (backpressureTimer) clearTimeout(backpressureTimer);
    if (stopStdinTimer) {
      clearTimeout(stopStdinTimer);
      stopStdinTimer = null;
    }
    if (stopForceTimer) {
      clearTimeout(stopForceTimer);
      stopForceTimer = null;
    }
    // On graceful exit, drain any buffered partial as a final commit so the
    // last utterance isn't lost when whisper.cpp closes without a trailing \n.
    if (!killed && exitResolver !== null) {
      for (const event of parser.flush()) options.onEvent(event);
    }
    if (!killed && code !== 0 && exitResolver === null) {
      options.onEvent({
        kind: "error",
        code: "child-crashed",
        message: `whisper.cpp exited with code ${code ?? "null"}`,
      });
    }
    exitResolver?.();
    exitResolver = null;
  });

  child.on("error", (err) => {
    options.onEvent({ kind: "error", code: "spawn-failed", message: err.message });
  });

  function writeFrame(frame: Buffer): void {
    if (killed || !child.stdin) return;
    const ok = child.stdin.write(frame, () => {
      pendingWriteSince = null;
      if (backpressureTimer) {
        clearTimeout(backpressureTimer);
        backpressureTimer = null;
      }
    });
    if (!ok && pendingWriteSince === null) {
      pendingWriteSince = options.now();
      backpressureTimer = setTimeout(() => {
        const stalledMs = options.now() - (pendingWriteSince ?? 0);
        options.onEvent({
          kind: "error",
          code: "backpressure",
          message: `stdin stalled ${stalledMs}ms (limit ${options.backpressureTimeoutMs}ms)`,
        });
      }, options.backpressureTimeoutMs);
    }
  }

  async function stop(): Promise<void> {
    if (killed) return;
    return new Promise<void>((resolve) => {
      exitResolver = resolve;
      child.stdin?.end();
      stopStdinTimer = setTimeout(() => {
        child.stdin?.destroy();
      }, 250);
      stopForceTimer = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.stopTimeoutMs ?? 30_000);
      // The exit handler above will call parser.flush() before resolving so any
      // final buffered partial is emitted as a commit.
    });
  }

  function kill(): void {
    killed = true;
    // Discard any buffered text from a cancelled session — no leakage of a
    // half-formed partial after the user explicitly cancels.
    parser.reset();
    if (backpressureTimer) clearTimeout(backpressureTimer);
    if (stopStdinTimer) clearTimeout(stopStdinTimer);
    if (stopForceTimer) clearTimeout(stopForceTimer);
    child.kill("SIGTERM");
  }

  return { writeFrame, stop, kill };
}
