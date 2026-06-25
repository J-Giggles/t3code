import { describe, expect, it } from "vitest";

import {
  buildPairingPageUrl,
  deriveWsBaseUrl,
  joinHttpBasePath,
  normalizeHttpBaseUrl,
  resolveWsConnectionPath,
} from "./advertisedEndpoint.ts";

describe("advertisedEndpoint", () => {
  it("normalizes HTTP and WebSocket base URLs while preserving path prefixes", () => {
    expect(normalizeHttpBaseUrl("https://desktop.tail.ts.net/t3code?ignored=1#ignored")).toBe(
      "https://desktop.tail.ts.net/t3code/",
    );
    expect(normalizeHttpBaseUrl("wss://desktop.tail.ts.net/t3code")).toBe(
      "https://desktop.tail.ts.net/t3code/",
    );
    expect(deriveWsBaseUrl("https://desktop.tail.ts.net/t3code")).toBe(
      "wss://desktop.tail.ts.net/t3code/",
    );
  });

  it("strips pairing page paths when normalizing advertised bases", () => {
    expect(normalizeHttpBaseUrl("https://desktop.tail.ts.net/t3code/pair#token=abc")).toBe(
      "https://desktop.tail.ts.net/t3code/",
    );
    expect(normalizeHttpBaseUrl("https://desktop.tail.ts.net/pair")).toBe(
      "https://desktop.tail.ts.net/",
    );
  });

  it("joins HTTP and WebSocket paths under path-prefixed bases", () => {
    expect(joinHttpBasePath("https://desktop.tail.ts.net/t3code", "/auth/session")).toBe(
      "https://desktop.tail.ts.net/t3code/auth/session",
    );
    expect(resolveWsConnectionPath("https://desktop.tail.ts.net/t3code")).toBe("/t3code/ws");
    expect(resolveWsConnectionPath("https://desktop.tail.ts.net/")).toBe("/ws");
  });

  it("builds pairing page URLs under path-prefixed bases", () => {
    expect(buildPairingPageUrl("https://desktop.tail.ts.net/t3code", "secret")).toBe(
      "https://desktop.tail.ts.net/t3code/pair#token=secret",
    );
  });
});
