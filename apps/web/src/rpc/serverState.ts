import type {
  ServerConfig,
  ServerConfigProviderStatusesPayload,
  ServerRuntimeRestartRequiredPayload,
} from "@t3tools/contracts";

let serverConfigSnapshotForTests: ServerConfig | null = null;
let runtimeRestartRequiredForTests: {
  readonly payload: ServerRuntimeRestartRequiredPayload;
  readonly sequence: number;
} | null = null;

export function applyProvidersUpdated(_payload: ServerConfigProviderStatusesPayload): void {
  // Server provider state is atom-driven in the rewritten runtime. This adapter keeps
  // older feature components callable while their live state comes from subscriptions.
}

export function emitRuntimeRestartRequired(
  payload: ServerRuntimeRestartRequiredPayload,
  sequence: number,
): void {
  runtimeRestartRequiredForTests = { payload, sequence };
}

export function setServerConfigSnapshot(config: ServerConfig): void {
  serverConfigSnapshotForTests = config;
}

export function getServerConfigSnapshotForTests(): ServerConfig | null {
  return serverConfigSnapshotForTests;
}

export function getRuntimeRestartRequiredForTests(): {
  readonly payload: ServerRuntimeRestartRequiredPayload;
  readonly sequence: number;
} | null {
  return runtimeRestartRequiredForTests;
}

export function resetServerStateForTests(): void {
  serverConfigSnapshotForTests = null;
  runtimeRestartRequiredForTests = null;
}
