import { stripAnsi } from "../utils/stripAnsi.ts";

/**
 * Internal events emitted by the whisper.cpp stdout parser.
 *
 * Note on the discriminator: this internal event uses `kind`, whereas the
 * wire-facing `DictationStreamEvent` (in `@t3tools/contracts/dictation`) uses
 * `type`. The conversion happens in `dictationService` at the wire boundary.
 */
export type WhisperStdoutEvent =
  | { kind: "partial"; text: string }
  | { kind: "commit"; text: string };

export interface WhisperStdoutParser {
  /**
   * Feed a chunk of stdout text. Returns events emitted by terminator
   * characters (`\r` for partial, `\n` for commit) inside this chunk.
   * Buffered text without a terminator is held until the next call.
   */
  feed(chunk: string): WhisperStdoutEvent[];
  /**
   * Emit any buffered text as a final commit (called when the stream ends).
   * Returns at most one event; empty buffer returns an empty array.
   */
  flush(): WhisperStdoutEvent[];
  /** Discard buffered text without emitting anything (called on cancel/kill). */
  reset(): void;
}

function clean(text: string): string {
  return stripAnsi(text)
    .replaceAll(/\[BLANK_AUDIO\]/gi, "")
    .replaceAll(/[ \t]{2,}/g, " ")
    .trim();
}

export function makeWhisperStdoutParser(): WhisperStdoutParser {
  let buffer = "";

  return {
    feed(chunk) {
      const events: WhisperStdoutEvent[] = [];
      for (const char of chunk) {
        if (char === "\r") {
          // Always emit on \r — even an empty partial is a meaningful
          // "clear the visible partial" signal.
          events.push({ kind: "partial", text: clean(buffer) });
          buffer = "";
        } else if (char === "\n") {
          // Skip empty commits — no transcribed content to surface.
          const text = clean(buffer);
          buffer = "";
          if (text.length > 0) events.push({ kind: "commit", text });
        } else {
          buffer += char;
        }
      }
      return events;
    },
    flush() {
      const text = clean(buffer);
      buffer = "";
      return text.length > 0 ? [{ kind: "commit", text }] : [];
    },
    reset() {
      buffer = "";
    },
  };
}
