import { describe, expect, it } from "vitest";
import { makeWhisperStdoutParser } from "./whisperStdoutParser.ts";

describe("makeWhisperStdoutParser", () => {
  it("emits partial on \\r and commit on \\n", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("hello\r")).toEqual([{ kind: "partial", text: "hello" }]);
    expect(parser.feed("hello world\r")).toEqual([{ kind: "partial", text: "hello world" }]);
    expect(parser.feed("hello world.\n")).toEqual([{ kind: "commit", text: "hello world." }]);
  });

  it("strips ESC-anchored ANSI escapes from emitted text", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("\x1b[2K\x1b[1Ghello\r")).toEqual([{ kind: "partial", text: "hello" }]);
  });

  it("preserves bracket-number patterns in transcript text (no false ANSI strip)", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("meeting at [3pm]\n")).toEqual([
      { kind: "commit", text: "meeting at [3pm]" },
    ]);
  });

  it("buffers across chunks until a terminator arrives", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("hel")).toEqual([]);
    expect(parser.feed("lo wor")).toEqual([]);
    expect(parser.feed("ld\r")).toEqual([{ kind: "partial", text: "hello world" }]);
  });

  it("emits multiple events from one chunk containing several terminators", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("hello\rhello world\rhello world.\n")).toEqual([
      { kind: "partial", text: "hello" },
      { kind: "partial", text: "hello world" },
      { kind: "commit", text: "hello world." },
    ]);
  });

  it("emits empty partial when \\r appears with no buffered text (clear-partial signal)", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("\r")).toEqual([{ kind: "partial", text: "" }]);
  });

  it("skips empty commits (empty \\n carries no transcribed content)", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("\n")).toEqual([]);
  });

  it("filters whisper blank-audio tokens from partials and commits", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("[BLANK_AUDIO][BLANK_AUDIO]\r")).toEqual([{ kind: "partial", text: "" }]);
    expect(parser.feed("[BLANK_AUDIO][BLANK_AUDIO]\n")).toEqual([]);
    expect(parser.feed("hello [BLANK_AUDIO] world\n")).toEqual([
      { kind: "commit", text: "hello world" },
    ]);
  });

  it("trims whitespace from emitted text", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("   hello   \r")).toEqual([{ kind: "partial", text: "hello" }]);
  });

  it("handles ANSI-only payload by emitting empty partial", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.feed("\x1b[2K\x1b[1G\r")).toEqual([{ kind: "partial", text: "" }]);
  });

  it("flush() emits a final commit for buffered text when stream ends without \\n", () => {
    const parser = makeWhisperStdoutParser();
    parser.feed("incomplete utterance");
    expect(parser.flush()).toEqual([{ kind: "commit", text: "incomplete utterance" }]);
  });

  it("flush() returns no event when buffer is empty", () => {
    const parser = makeWhisperStdoutParser();
    expect(parser.flush()).toEqual([]);
  });

  it("reset() drops buffered text silently", () => {
    const parser = makeWhisperStdoutParser();
    parser.feed("about to be cancelled");
    parser.reset();
    expect(parser.flush()).toEqual([]);
  });

  it("buffers ANSI escape that spans across two chunks", () => {
    const parser = makeWhisperStdoutParser();
    // chunk 1 ends mid-escape: \x1b alone (no closing letter yet)
    expect(parser.feed("hello\x1b")).toEqual([]);
    // chunk 2 completes the escape and adds the terminator
    expect(parser.feed("[2K world\r")).toEqual([{ kind: "partial", text: "hello world" }]);
  });
});
