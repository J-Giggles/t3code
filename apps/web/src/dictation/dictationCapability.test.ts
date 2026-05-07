import { describe, expect, it } from "vitest";
import { resolveDictationCapability } from "./dictationCapability.ts";

describe("resolveDictationCapability", () => {
  it("unavailable when server reports unavailable", () => {
    expect(
      resolveDictationCapability({
        server: {
          available: false,
          reason: "missing",
          modelLabel: null,
          modelPath: null,
          binaryPath: null,
        },
        isSecureContext: true,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: false, reason: "missing" });
  });

  it("unavailable when not in secure context", () => {
    expect(
      resolveDictationCapability({
        server: {
          available: true,
          reason: null,
          modelLabel: "x",
          modelPath: "/m",
          binaryPath: "/x",
        },
        isSecureContext: false,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: false, reason: expect.stringMatching(/secure context|https/i) });
  });

  it("unavailable when no mediaDevices", () => {
    expect(
      resolveDictationCapability({
        server: {
          available: true,
          reason: null,
          modelLabel: "x",
          modelPath: "/m",
          binaryPath: "/x",
        },
        isSecureContext: true,
        hasMediaDevices: false,
      }),
    ).toEqual({ available: false, reason: expect.stringMatching(/mediadevices|browser/i) });
  });

  it("available when all checks pass", () => {
    expect(
      resolveDictationCapability({
        server: {
          available: true,
          reason: null,
          modelLabel: "ggml-base.en",
          modelPath: "/m",
          binaryPath: "/x",
        },
        isSecureContext: true,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: true, reason: null, modelLabel: "ggml-base.en" });
  });
});
