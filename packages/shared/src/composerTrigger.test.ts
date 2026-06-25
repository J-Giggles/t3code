import { describe, expect, it } from "vite-plus/test";

import {
  detectComposerTrigger,
  parseComposerThreadReference,
  serializeComposerFileLink,
  serializeComposerMentionPath,
  serializeComposerThreadReference,
} from "./composerTrigger.ts";

describe("detectComposerTrigger", () => {
  it("detects slash commands in the middle of a line", () => {
    const text = "Please /rev";

    expect(detectComposerTrigger(text, text.length)).toEqual({
      kind: "slash-command",
      query: "rev",
      rangeStart: "Please ".length,
      rangeEnd: text.length,
    });
  });

  it("keeps /model as the model trigger but closes after arguments", () => {
    expect(detectComposerTrigger("/model", "/model".length)).toEqual({
      kind: "slash-model",
      query: "",
      rangeStart: 0,
      rangeEnd: "/model".length,
    });
    expect(detectComposerTrigger("/model spark", "/model spark".length)).toBeNull();
  });

  it("does not detect dollar-prefixed skill triggers", () => {
    const text = "Use $review";

    expect(detectComposerTrigger(text, text.length)).toBeNull();
  });
});

describe("serializeComposerMentionPath", () => {
  it("keeps simple mention paths unquoted", () => {
    expect(serializeComposerMentionPath("src/index.ts")).toBe("src/index.ts");
  });

  it("quotes mention paths containing whitespace", () => {
    expect(serializeComposerMentionPath("docs/My File.md")).toBe('"docs/My File.md"');
  });

  it("escapes quoted mention path content", () => {
    expect(serializeComposerMentionPath('docs/My "File".md')).toBe('"docs/My \\"File\\".md"');
  });
});

describe("serializeComposerFileLink", () => {
  it("uses the basename as the markdown label", () => {
    expect(serializeComposerFileLink("path/to/package.json")).toBe(
      "[package.json](path/to/package.json)",
    );
  });

  it("encodes markdown-sensitive destination characters", () => {
    expect(serializeComposerFileLink("docs/My File (draft).md")).toBe(
      "[My File (draft).md](docs/My%20File%20%28draft%29.md)",
    );
  });

  it("supports windows paths", () => {
    expect(serializeComposerFileLink("C:\\repo\\src\\index.ts")).toBe(
      "[index.ts](C:%5Crepo%5Csrc%5Cindex.ts)",
    );
  });

  it("preserves paths that legitimately start with an at sign", () => {
    expect(serializeComposerFileLink("@scope/package.json")).toBe(
      "[package.json](@scope/package.json)",
    );
  });
});

describe("composer thread references", () => {
  it("serializes stable environment/thread ids", () => {
    expect(
      serializeComposerThreadReference({
        environmentId: "local dev",
        threadId: "thread:123",
      }),
    ).toBe("thread:local%20dev:thread%3A123");
  });

  it("parses stable environment/thread ids", () => {
    expect(parseComposerThreadReference("thread:local%20dev:thread%3A123")).toEqual({
      environmentId: "local dev",
      threadId: "thread:123",
    });
  });

  it("rejects malformed thread references", () => {
    expect(parseComposerThreadReference("chat:old-slug")).toBeNull();
    expect(parseComposerThreadReference("thread:only-one-part")).toBeNull();
  });
});
