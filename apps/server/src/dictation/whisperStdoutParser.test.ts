import { describe, expect, it } from "vitest";
import { parseWhisperStdoutLine } from "./whisperStdoutParser.ts";

describe("parseWhisperStdoutLine", () => {
  it("parses partial events", () => {
    expect(parseWhisperStdoutLine("[partial] hello world")).toEqual({
      kind: "partial",
      text: "hello world",
    });
  });

  it("parses commit events", () => {
    expect(parseWhisperStdoutLine("[commit] hello world.")).toEqual({
      kind: "commit",
      text: "hello world.",
    });
  });

  it("trims trailing whitespace and ANSI escapes from text", () => {
    expect(parseWhisperStdoutLine("[partial] [2K[1G hello [0m  ")).toEqual({
      kind: "partial",
      text: "hello",
    });
  });

  it("returns null for empty lines", () => {
    expect(parseWhisperStdoutLine("")).toBeNull();
    expect(parseWhisperStdoutLine("   ")).toBeNull();
  });

  it("returns null for unrecognized lines (logged separately)", () => {
    expect(parseWhisperStdoutLine("loading model...")).toBeNull();
    expect(parseWhisperStdoutLine("whisper_init: loaded ggml-base.en.bin")).toBeNull();
  });

  it("treats whitespace-only payload as empty text (still emitted)", () => {
    expect(parseWhisperStdoutLine("[partial]   ")).toEqual({ kind: "partial", text: "" });
  });
});
