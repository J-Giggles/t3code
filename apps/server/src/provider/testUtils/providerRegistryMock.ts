import { ProviderRegistry, type ProviderRegistryShape } from "../Services/ProviderRegistry.ts";
import { DEFAULT_SERVER_SETTINGS, type ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";

export const makeProviderRegistryMock = (
  providers: ReadonlyArray<ServerProvider> = [],
): ProviderRegistryShape => ({
  getProviders: Effect.succeed(providers),
  refresh: () => Effect.succeed(providers),
  refreshInstance: () => Effect.succeed(providers),
  writeProviderSkillConfig: (input) =>
    Effect.succeed({ effectiveEnabled: input.enabled, providers }),
  resetProvider: () =>
    Effect.succeed({
      providers,
      settings: DEFAULT_SERVER_SETTINGS,
      nativeReset: { status: "skipped" },
    }),
  getProviderMaintenanceCapabilitiesForInstance: (_instanceId, provider) =>
    Effect.succeed(makeManualOnlyProviderMaintenanceCapabilities({ provider, packageName: null })),
  setProviderMaintenanceActionState: () => Effect.succeed(providers),
  streamChanges: Stream.empty,
});

export const makeProviderRegistryLayer = (providers: ReadonlyArray<ServerProvider> = []) =>
  Layer.succeed(ProviderRegistry, makeProviderRegistryMock(providers));
