import { ProviderInstanceId, ThreadId, type OrchestrationSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProviderSessionRuntime } from "../persistence/Services/ProviderSessionRuntime.ts";
import { deriveProviderConnection } from "./providerConnection.ts";

const threadId = ThreadId.make("thread-provider-connection");
const providerInstanceId = ProviderInstanceId.make("codex");

const session = {
  threadId,
  status: "running",
  providerName: "codex",
  providerInstanceId,
  runtimeMode: "full-access",
  activeTurnId: null,
  lastError: null,
  updatedAt: "2026-06-12T10:00:00.000Z",
} satisfies OrchestrationSession;

const runtime = {
  threadId,
  providerName: "codex",
  providerInstanceId,
  adapterKey: "codex",
  runtimeMode: "full-access",
  status: "running",
  lastSeenAt: "2026-06-12T10:00:00.000Z",
  resumeCursor: null,
  runtimePayload: {
    lastRuntimeEvent: "provider.turn.started",
    lastRuntimeEventAt: "2026-06-12T10:00:00.000Z",
  },
} satisfies ProviderSessionRuntime;

describe("deriveProviderConnection", () => {
  it("marks fresh active runtime as connected", () => {
    expect(
      deriveProviderConnection({
        session,
        runtime,
        nowMs: Date.parse("2026-06-12T10:00:10.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("connected");
  });

  it("marks old active runtime as stale", () => {
    expect(
      deriveProviderConnection({
        session,
        runtime,
        nowMs: Date.parse("2026-06-12T10:01:00.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("stale");
  });

  it("marks stopped runtime as disconnected", () => {
    expect(
      deriveProviderConnection({
        session: { ...session, status: "stopped" },
        runtime: { ...runtime, status: "stopped" },
        nowMs: Date.parse("2026-06-12T10:00:10.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("disconnected");
  });

  it("marks error session as error", () => {
    expect(
      deriveProviderConnection({
        session: { ...session, status: "error" },
        runtime,
        nowMs: Date.parse("2026-06-12T10:00:10.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("error");
  });

  it("marks invalid lastSeenAt as unknown", () => {
    expect(
      deriveProviderConnection({
        session,
        runtime: { ...runtime, lastSeenAt: "not-a-date" },
        nowMs: Date.parse("2026-06-12T10:00:10.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("unknown");
  });

  it("marks auto-resume marker as recovering", () => {
    expect(
      deriveProviderConnection({
        session,
        runtime: {
          ...runtime,
          runtimePayload: { lastRuntimeEvent: "provider.session.auto-resume-started" },
        },
        nowMs: Date.parse("2026-06-12T10:00:10.000Z"),
        staleAfterMs: 30_000,
      }).status,
    ).toBe("recovering");
  });
});
