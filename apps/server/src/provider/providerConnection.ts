import type { OrchestrationProviderConnection, OrchestrationSession } from "@t3tools/contracts";

import type { ProviderSessionRuntime } from "../persistence/Services/ProviderSessionRuntime.ts";

const ACTIVE_SESSION_STATUSES = new Set<OrchestrationSession["status"]>([
  "starting",
  "running",
  "paused",
]);

function readRuntimePayloadString(
  runtimePayload: ProviderSessionRuntime["runtimePayload"],
  key: string,
): string | null {
  if (
    runtimePayload === null ||
    typeof runtimePayload !== "object" ||
    Array.isArray(runtimePayload)
  ) {
    return null;
  }
  const value = (runtimePayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function deriveProviderConnection(input: {
  readonly session: OrchestrationSession | null;
  readonly runtime: ProviderSessionRuntime | null;
  readonly nowMs: number;
  readonly staleAfterMs: number;
}): OrchestrationProviderConnection {
  const lastRuntimeEvent = readRuntimePayloadString(
    input.runtime?.runtimePayload ?? null,
    "lastRuntimeEvent",
  );
  const lastRuntimeEventAt = readRuntimePayloadString(
    input.runtime?.runtimePayload ?? null,
    "lastRuntimeEventAt",
  );
  const base = {
    lastSeenAt: input.runtime?.lastSeenAt ?? null,
    lastRuntimeEvent,
    lastRuntimeEventAt,
    staleAfterMs: input.staleAfterMs,
  } satisfies Omit<OrchestrationProviderConnection, "status">;

  if (input.session === null && input.runtime === null) {
    return { ...base, status: "unknown" };
  }
  if (input.runtime?.status === "error" || input.session?.status === "error") {
    return { ...base, status: "error" };
  }
  if (input.runtime?.status === "stopped" || input.session?.status === "stopped") {
    return { ...base, status: "disconnected" };
  }
  if (lastRuntimeEvent === "provider.session.auto-resume-started") {
    return { ...base, status: "recovering" };
  }
  if (
    input.session &&
    ACTIVE_SESSION_STATUSES.has(input.session.status) &&
    input.runtime === null
  ) {
    return { ...base, status: "stale" };
  }
  if (input.runtime === null) {
    return { ...base, status: "unknown" };
  }

  const lastSeenMs = Date.parse(input.runtime.lastSeenAt);
  if (Number.isNaN(lastSeenMs)) {
    return { ...base, status: "unknown" };
  }
  if (
    input.session &&
    ACTIVE_SESSION_STATUSES.has(input.session.status) &&
    input.nowMs - lastSeenMs > input.staleAfterMs
  ) {
    return { ...base, status: "stale" };
  }
  return { ...base, status: "connected" };
}

export const DEFAULT_PROVIDER_CONNECTION_STALE_AFTER_MS = 30 * 1000;
