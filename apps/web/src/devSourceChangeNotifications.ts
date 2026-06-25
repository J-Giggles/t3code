import {
  type ServerRuntimeRestartRequiredPayload,
  type ServerRuntimeRestartCapability,
} from "@t3tools/contracts";

import {
  DEFAULT_DEV_SOURCE_CHANGE_REASON,
  DEV_SOURCE_CHANGED_EVENT,
  type DevSourceChangePayload,
} from "./lib/devRestartNotification";
import { emitRuntimeRestartRequired } from "./rpc/serverState";

const fallbackCapability = {
  available: false,
  kind: "unsupported",
  scope: "full-setup",
  reason: "No compatible restart backend is connected.",
} satisfies ServerRuntimeRestartCapability;

function isDevSourceChangePayload(value: unknown): value is DevSourceChangePayload {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as DevSourceChangePayload).detectedAt === "string" &&
    typeof (value as DevSourceChangePayload).reason === "string" &&
    typeof (value as DevSourceChangePayload).sequence === "number"
  );
}

function toRuntimeRestartRequiredPayload(
  payload: DevSourceChangePayload,
): ServerRuntimeRestartRequiredPayload {
  return {
    detectedAt: payload.detectedAt,
    reason: payload.reason.trim() || DEFAULT_DEV_SOURCE_CHANGE_REASON,
    capability: fallbackCapability,
  };
}

export function installDevSourceChangeNotifications(): void {
  if (!import.meta.hot) {
    return;
  }

  import.meta.hot.on(DEV_SOURCE_CHANGED_EVENT, (payload: unknown) => {
    if (!isDevSourceChangePayload(payload)) {
      return;
    }

    emitRuntimeRestartRequired(toRuntimeRestartRequiredPayload(payload), payload.sequence);
  });
}
