import type { EnvironmentApi, EnvironmentId } from "@t3tools/contracts";
import { createWsRpcClient, type WsRpcClient } from "@t3tools/client-runtime/wsRpcClient";
import { WsTransport } from "@t3tools/client-runtime/wsTransport";

import { readPreparedConnection } from "./state/session";

const environmentApiOverrides = new Map<EnvironmentId, EnvironmentApi>();
const environmentRpcClients = new Map<
  EnvironmentId,
  {
    readonly socketUrl: string;
    readonly client: WsRpcClient;
  }
>();

function disposeClient(client: WsRpcClient): void {
  void client.dispose().catch(() => undefined);
}

export function readEnvironmentRpcClient(environmentId: EnvironmentId): WsRpcClient | null {
  const prepared = readPreparedConnection(environmentId);
  if (!prepared) return null;

  const existing = environmentRpcClients.get(environmentId);
  if (existing?.socketUrl === prepared.socketUrl) {
    return existing.client;
  }

  if (existing) {
    disposeClient(existing.client);
  }

  const transport = new WsTransport(prepared.socketUrl);
  const client = createWsRpcClient(transport);
  environmentRpcClients.set(environmentId, {
    socketUrl: prepared.socketUrl,
    client,
  });
  return client;
}

export function readEnvironmentApi(environmentId: EnvironmentId): EnvironmentApi | null {
  return (
    environmentApiOverrides.get(environmentId) ??
    (readEnvironmentRpcClient(environmentId) as unknown as EnvironmentApi | null)
  );
}

export function ensureEnvironmentApi(environmentId: EnvironmentId): EnvironmentApi {
  const api = readEnvironmentApi(environmentId);
  if (!api) {
    throw new Error(`Environment API is not available for ${environmentId}.`);
  }
  return api;
}

export function __setEnvironmentApiOverrideForTests(
  environmentId: EnvironmentId,
  api: EnvironmentApi,
): void {
  environmentApiOverrides.set(environmentId, api);
}

export function __resetEnvironmentApiOverridesForTests(): void {
  environmentApiOverrides.clear();
  for (const { client } of environmentRpcClients.values()) {
    disposeClient(client);
  }
  environmentRpcClients.clear();
}
