import {
  createAdvertisedEndpoint,
  type CreateAdvertisedEndpointInput,
} from "@t3tools/shared/advertisedEndpoint";
import {
  DEFAULT_PUBLIC_PATH_PREFIX,
  normalizePublicPathPrefix,
  validateTailscaleServeUiRoute,
} from "@t3tools/shared/publicPath";
import type {
  AdvertisedEndpoint,
  AdvertisedEndpointProvider,
  DesktopServerExposureMode,
  DesktopServerExposureState,
  DesktopTailscaleAccessEnableInput,
  DesktopTailscaleAccessState,
  DesktopTailscaleServeRouteProbeInput,
  DesktopTailscaleServeRouteProbeResult,
} from "@t3tools/contracts";
import { DesktopServerExposureModeSchema } from "@t3tools/contracts";
import {
  assertTailscaleServePathAvailable,
  buildTailscaleHttpsBaseUrl,
  disableTailscaleServeIfOwned,
  ensureTailscaleServe,
  probeTailscaleHttpsEndpoint,
  readTailscaleServeRouteAvailability,
  readTailscaleServeRouteStatus,
  readTailscaleStatus,
  type TailscaleCommandError,
  type TailscaleServePathConflictError,
  type TailscaleServeStatusParseError,
} from "@t3tools/tailscale";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopNetworkInterfaces from "./DesktopNetworkInterfaces.ts";
import { resolveTailscaleAdvertisedEndpoints } from "./tailscaleEndpointProvider.ts";
import * as DesktopAppSettingsService from "../settings/DesktopAppSettings.ts";
import { checkDesktopTailscaleReservedServeRoute } from "./tailscaleRouteOwnership.ts";

const TAILSCALE_STATUS_CACHE_TTL = Duration.seconds(60);

export const DESKTOP_LOOPBACK_HOST = "127.0.0.1";
const DESKTOP_LAN_BIND_HOST = "0.0.0.0";

interface ResolvedDesktopServerExposure {
  readonly mode: DesktopServerExposureMode;
  readonly bindHost: string;
  readonly localHttpUrl: string;
  readonly localWsUrl: string;
  readonly endpointUrl: string | null;
  readonly advertisedHost: string | null;
}

interface DesktopAdvertisedEndpointInput {
  readonly port: number;
  readonly exposure: ResolvedDesktopServerExposure;
  readonly customHttpsEndpointUrls?: readonly string[];
}

const DESKTOP_CORE_ENDPOINT_PROVIDER: AdvertisedEndpointProvider = {
  id: "desktop-core",
  label: "Desktop",
  kind: "core",
  isAddon: false,
};

const DESKTOP_MANUAL_ENDPOINT_PROVIDER: AdvertisedEndpointProvider = {
  id: "manual",
  label: "Manual",
  kind: "manual",
  isAddon: false,
};

const normalizeOptionalHost = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const isUsableLanIpv4Address = (address: string): boolean =>
  !address.startsWith("127.") && !address.startsWith("169.254.");

const isHttpsEndpointUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const resolveLanAdvertisedHost = (
  networkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces,
  explicitHost: string | undefined,
): string | null => {
  const normalizedExplicitHost = normalizeOptionalHost(explicitHost);
  if (normalizedExplicitHost) {
    return normalizedExplicitHost;
  }

  for (const interfaceAddresses of Object.values(networkInterfaces)) {
    if (!interfaceAddresses) continue;

    for (const address of interfaceAddresses) {
      if (address.internal) continue;
      if (address.family !== "IPv4") continue;
      if (!isUsableLanIpv4Address(address.address)) continue;
      return address.address;
    }
  }

  return null;
};

const resolveDesktopServerExposure = (input: {
  readonly mode: DesktopServerExposureMode;
  readonly port: number;
  readonly networkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces;
  readonly advertisedHostOverride?: string;
}): ResolvedDesktopServerExposure => {
  const localHttpUrl = `http://${DESKTOP_LOOPBACK_HOST}:${input.port}`;
  const localWsUrl = `ws://${DESKTOP_LOOPBACK_HOST}:${input.port}`;

  if (input.mode === "local-only") {
    return {
      mode: input.mode,
      bindHost: DESKTOP_LOOPBACK_HOST,
      localHttpUrl,
      localWsUrl,
      endpointUrl: null,
      advertisedHost: null,
    };
  }

  const advertisedHost = resolveLanAdvertisedHost(
    input.networkInterfaces,
    input.advertisedHostOverride,
  );

  return {
    mode: input.mode,
    bindHost: DESKTOP_LAN_BIND_HOST,
    localHttpUrl,
    localWsUrl,
    endpointUrl: advertisedHost ? `http://${advertisedHost}:${input.port}` : null,
    advertisedHost,
  };
};

const createDesktopEndpoint = (
  input: Omit<CreateAdvertisedEndpointInput, "provider" | "source">,
): AdvertisedEndpoint =>
  createAdvertisedEndpoint({
    ...input,
    provider: DESKTOP_CORE_ENDPOINT_PROVIDER,
    source: "desktop-core",
  });

const createManualEndpoint = (
  input: Omit<CreateAdvertisedEndpointInput, "provider" | "source">,
): AdvertisedEndpoint =>
  createAdvertisedEndpoint({
    ...input,
    provider: DESKTOP_MANUAL_ENDPOINT_PROVIDER,
    source: "user",
  });

const resolveDesktopCoreAdvertisedEndpoints = (
  input: DesktopAdvertisedEndpointInput,
): readonly AdvertisedEndpoint[] => {
  const endpoints: AdvertisedEndpoint[] = [
    createDesktopEndpoint({
      id: `desktop-loopback:${input.port}`,
      label: "This machine",
      httpBaseUrl: input.exposure.localHttpUrl,
      reachability: "loopback",
      status: "available",
      description: "Loopback endpoint for this desktop app.",
    }),
  ];

  if (input.exposure.endpointUrl) {
    endpoints.push(
      createDesktopEndpoint({
        id: `desktop-lan:${input.exposure.endpointUrl}`,
        label: "Local network",
        httpBaseUrl: input.exposure.endpointUrl,
        reachability: "lan",
        status: "available",
        isDefault: true,
        description: "Reachable from devices on the same network.",
      }),
    );
  }

  for (const customEndpointUrl of input.customHttpsEndpointUrls ?? []) {
    try {
      const isHttpsEndpoint = isHttpsEndpointUrl(customEndpointUrl);
      endpoints.push(
        createManualEndpoint({
          id: `manual:${customEndpointUrl}`,
          label: isHttpsEndpoint ? "Custom HTTPS" : "Custom endpoint",
          httpBaseUrl: customEndpointUrl,
          reachability: "public",
          ...(isHttpsEndpoint ? ({ hostedHttpsCompatibility: "compatible" } as const) : {}),
          status: "unknown",
          description: isHttpsEndpoint
            ? "User-configured HTTPS endpoint for this desktop backend."
            : "User-configured endpoint for this desktop backend.",
        }),
      );
    } catch {
      // Ignore malformed user-configured endpoints without dropping valid endpoints.
    }
  }

  return endpoints;
};

export class DesktopServerExposureNoNetworkAddressError extends Schema.TaggedErrorClass<DesktopServerExposureNoNetworkAddressError>()(
  "DesktopServerExposureNoNetworkAddressError",
  {
    port: Schema.Number,
  },
) {
  override get message(): string {
    return `No reachable network address is available for desktop network access on port ${this.port}.`;
  }
}

export class DesktopServerExposureModePersistenceError extends Schema.TaggedErrorClass<DesktopServerExposureModePersistenceError>()(
  "DesktopServerExposureModePersistenceError",
  {
    mode: DesktopServerExposureModeSchema,
    cause: Schema.instanceOf(DesktopAppSettings.DesktopSettingsWriteError),
  },
) {
  override get message(): string {
    return `Failed to persist desktop server exposure mode ${this.mode}.`;
  }
}

export class DesktopTailscaleServePersistenceError extends Schema.TaggedErrorClass<DesktopTailscaleServePersistenceError>()(
  "DesktopTailscaleServePersistenceError",
  {
    enabled: Schema.Boolean,
    port: Schema.NullOr(Schema.Number),
    cause: Schema.instanceOf(DesktopAppSettings.DesktopSettingsWriteError),
  },
) {
  override get message(): string {
    return `Failed to persist desktop Tailscale Serve settings (enabled: ${this.enabled}, port: ${this.port ?? "unchanged"}).`;
  }
}

export class DesktopTailscaleServePathValidationError extends Schema.TaggedErrorClass<DesktopTailscaleServePathValidationError>()(
  "DesktopTailscaleServePathValidationError",
  {
    servePath: Schema.String,
    issue: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export class DesktopTailscaleServeRouteReservationError extends Schema.TaggedErrorClass<DesktopTailscaleServeRouteReservationError>()(
  "DesktopTailscaleServeRouteReservationError",
  {
    servePath: Schema.String,
    expectedBranch: Schema.String,
    expectedWorktreeBasename: Schema.String,
    expectedDescription: Schema.String,
    actualBranch: Schema.NullOr(Schema.String),
    actualWorktreePath: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export const DesktopServerExposureSetModeError = Schema.Union([
  DesktopServerExposureNoNetworkAddressError,
  DesktopServerExposureModePersistenceError,
]);
export type DesktopServerExposureSetModeError = typeof DesktopServerExposureSetModeError.Type;
export const isDesktopServerExposureSetModeError = Schema.is(DesktopServerExposureSetModeError);

export const DesktopServerExposurePersistenceError = Schema.Union([
  DesktopServerExposureModePersistenceError,
  DesktopTailscaleServePersistenceError,
]);
export type DesktopServerExposurePersistenceError =
  typeof DesktopServerExposurePersistenceError.Type;

export const DesktopServerExposureError = Schema.Union([
  DesktopServerExposureNoNetworkAddressError,
  DesktopServerExposureModePersistenceError,
  DesktopTailscaleServePersistenceError,
]);
export type DesktopServerExposureError = typeof DesktopServerExposureError.Type;
export const isDesktopServerExposureError = Schema.is(DesktopServerExposureError);

export interface DesktopServerExposureBackendConfig {
  readonly port: number;
  readonly bindHost: string;
  readonly httpBaseUrl: URL;
  readonly tailscaleServeEnabled: boolean;
  readonly tailscaleServePort: number;
  readonly tailscaleServePath: string;
}

export interface DesktopServerExposureChange {
  readonly state: DesktopServerExposureState;
  readonly requiresRelaunch: boolean;
}

export interface DesktopTailscalePreviousRouteCleanup {
  readonly disabled: boolean;
  readonly existingProxyUrl: string | null;
}

export interface DesktopTailscaleAccessChange {
  readonly state: DesktopTailscaleAccessState;
  readonly requiresRelaunch: boolean;
  readonly previousRouteCleanup: DesktopTailscalePreviousRouteCleanup | null;
}

export interface DesktopServerExposureShape {
  readonly getState: Effect.Effect<DesktopServerExposureState>;
  readonly backendConfig: Effect.Effect<DesktopServerExposureBackendConfig>;
  readonly configureFromSettings: (input: {
    readonly port: number;
  }) => Effect.Effect<DesktopServerExposureState>;
  readonly setMode: (
    mode: DesktopServerExposureMode,
  ) => Effect.Effect<DesktopServerExposureChange, DesktopServerExposureSetModeError>;
  readonly setTailscaleServeEnabled: (input: {
    readonly enabled: boolean;
    readonly port?: number;
    readonly servePath?: string;
  }) => Effect.Effect<DesktopServerExposureChange, DesktopServerExposurePersistenceError>;
  readonly getTailscaleAccessState: (input?: {
    readonly probe?: boolean;
  }) => Effect.Effect<DesktopTailscaleAccessState>;
  readonly enableTailscaleAccess: (
    input?: DesktopTailscaleAccessEnableInput,
  ) => Effect.Effect<
    DesktopServerExposureChange,
    | DesktopServerExposurePersistenceError
    | DesktopTailscaleServePathValidationError
    | DesktopTailscaleServeRouteReservationError
    | TailscaleCommandError
    | TailscaleServePathConflictError
    | TailscaleServeStatusParseError
  >;
  readonly checkTailscaleServeRoute: (
    input: DesktopTailscaleServeRouteProbeInput,
  ) => Effect.Effect<DesktopTailscaleServeRouteProbeResult>;
  readonly updateTailscaleServePath: (input: {
    readonly servePath: string;
  }) => Effect.Effect<
    DesktopTailscaleAccessChange,
    | DesktopServerExposurePersistenceError
    | DesktopTailscaleServePathValidationError
    | DesktopTailscaleServeRouteReservationError
    | TailscaleCommandError
    | TailscaleServePathConflictError
    | TailscaleServeStatusParseError
  >;
  readonly disableTailscaleAccess: Effect.Effect<
    DesktopServerExposureChange,
    DesktopServerExposurePersistenceError | TailscaleCommandError | TailscaleServeStatusParseError
  >;
  readonly repairTailscaleAccess: Effect.Effect<
    DesktopTailscaleAccessState,
    | DesktopServerExposurePersistenceError
    | DesktopTailscaleServePathValidationError
    | DesktopTailscaleServeRouteReservationError
    | TailscaleCommandError
    | TailscaleServePathConflictError
    | TailscaleServeStatusParseError
  >;
  readonly probeTailscaleAccess: Effect.Effect<DesktopTailscaleAccessState>;
  readonly syncTailscaleServeRouteOnBackendReady: Effect.Effect<void>;
  readonly getAdvertisedEndpoints: Effect.Effect<readonly AdvertisedEndpoint[]>;
}

export class DesktopServerExposure extends Context.Service<
  DesktopServerExposure,
  DesktopServerExposureShape
>()("@t3tools/desktop/backend/DesktopServerExposure") {}

interface RuntimeState {
  readonly requestedMode: DesktopServerExposureMode;
  readonly mode: DesktopServerExposureMode;
  readonly port: number;
  readonly bindHost: string;
  readonly localHttpUrl: string;
  readonly localWsUrl: string;
  readonly httpBaseUrl: URL;
  readonly endpointUrl: Option.Option<string>;
  readonly advertisedHost: Option.Option<string>;
  readonly tailscaleServeEnabled: boolean;
  readonly tailscaleServePort: number;
  readonly tailscaleServePath: string;
  readonly defaultTailscaleServePath: string;
}

interface ResolvedRuntimeState {
  readonly state: RuntimeState;
  readonly unavailable: boolean;
}

const DEFAULT_TAILSCALE_SERVE_PATH = DEFAULT_PUBLIC_PATH_PREFIX;

const initialRuntimeState = (
  defaultTailscaleServePath = DEFAULT_TAILSCALE_SERVE_PATH,
): RuntimeState =>
  runtimeStateFromResolvedExposure({
    requestedMode: DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS.serverExposureMode,
    settings: {
      ...DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS,
      tailscaleServePath: defaultTailscaleServePath,
    },
    defaultTailscaleServePath,
    exposure: resolveDesktopServerExposure({
      mode: DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS.serverExposureMode,
      port: 0,
      networkInterfaces: {},
    }),
    port: 0,
  });

const toContractState = (state: RuntimeState): DesktopServerExposureState => ({
  mode: state.mode,
  endpointUrl: Option.getOrNull(state.endpointUrl),
  advertisedHost: Option.getOrNull(state.advertisedHost),
  tailscaleServeEnabled: state.tailscaleServeEnabled,
  tailscaleServePort: state.tailscaleServePort,
  tailscaleServePath: state.tailscaleServePath,
});

const toBackendConfig = (state: RuntimeState): DesktopServerExposureBackendConfig => ({
  port: state.port,
  bindHost: state.bindHost,
  httpBaseUrl: state.httpBaseUrl,
  tailscaleServeEnabled: state.tailscaleServeEnabled,
  tailscaleServePort: state.tailscaleServePort,
  tailscaleServePath: state.tailscaleServePath,
});

const toResolvedExposure = (state: RuntimeState): ResolvedDesktopServerExposure => ({
  mode: state.mode,
  bindHost: state.bindHost,
  localHttpUrl: state.localHttpUrl,
  localWsUrl: state.localWsUrl,
  endpointUrl: Option.getOrNull(state.endpointUrl),
  advertisedHost: Option.getOrNull(state.advertisedHost),
});

function runtimeStateFromResolvedExposure(input: {
  readonly requestedMode: DesktopServerExposureMode;
  readonly settings: DesktopAppSettings.DesktopSettings;
  readonly defaultTailscaleServePath: string;
  readonly exposure: ResolvedDesktopServerExposure;
  readonly port: number;
}): RuntimeState {
  return {
    requestedMode: input.requestedMode,
    mode: input.exposure.mode,
    port: input.port,
    bindHost: input.exposure.bindHost,
    localHttpUrl: input.exposure.localHttpUrl,
    localWsUrl: input.exposure.localWsUrl,
    httpBaseUrl: new URL(input.exposure.localHttpUrl),
    endpointUrl: Option.fromNullishOr(input.exposure.endpointUrl),
    advertisedHost: Option.fromNullishOr(input.exposure.advertisedHost),
    tailscaleServeEnabled: input.settings.tailscaleServeEnabled,
    tailscaleServePort: input.settings.tailscaleServePort,
    tailscaleServePath: resolveTailscaleServePath({
      settings: input.settings,
      defaultPath: input.defaultTailscaleServePath,
    }),
    defaultTailscaleServePath: input.defaultTailscaleServePath,
  };
}

function resolveRuntimeState(input: {
  readonly requestedMode: DesktopServerExposureMode;
  readonly settings: DesktopAppSettings.DesktopSettings;
  readonly port: number;
  readonly networkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces;
  readonly advertisedHostOverride: Option.Option<string>;
  readonly defaultTailscaleServePath: string;
}): ResolvedRuntimeState {
  const advertisedHostOverride = Option.getOrUndefined(input.advertisedHostOverride);
  const requestedExposure = resolveDesktopServerExposure({
    mode: input.requestedMode,
    port: input.port,
    networkInterfaces: input.networkInterfaces,
    ...(advertisedHostOverride ? { advertisedHostOverride } : {}),
  });
  const unavailable =
    input.requestedMode === "network-accessible" && requestedExposure.endpointUrl === null;
  const exposure = unavailable
    ? resolveDesktopServerExposure({
        mode: "local-only",
        port: input.port,
        networkInterfaces: input.networkInterfaces,
        ...(advertisedHostOverride ? { advertisedHostOverride } : {}),
      })
    : requestedExposure;

  return {
    state: runtimeStateFromResolvedExposure({
      requestedMode: input.requestedMode,
      settings: input.settings,
      defaultTailscaleServePath: input.defaultTailscaleServePath,
      exposure,
      port: input.port,
    }),
    unavailable,
  };
}

const requiresBackendRelaunch = (previous: RuntimeState, next: RuntimeState): boolean =>
  previous.port !== next.port ||
  previous.bindHost !== next.bindHost ||
  previous.localHttpUrl !== next.localHttpUrl;

function resolveTailscaleServePath(input: {
  readonly settings: Pick<DesktopAppSettings.DesktopSettings, "tailscaleServePath">;
  readonly defaultPath: string;
  readonly overridePath?: string;
}): string {
  return (
    normalizePublicPathPrefix(input.overridePath) ??
    input.settings.tailscaleServePath ??
    input.defaultPath
  );
}

function normalizeRequestedTailscaleServePath(
  value: string | undefined,
  fallbackPath: string,
): Effect.Effect<string, DesktopTailscaleServePathValidationError> {
  const requested = value ?? fallbackPath;
  const validation = validateTailscaleServeUiRoute(requested);
  if (validation.valid) {
    return Effect.succeed(validation.route);
  }
  return Effect.fail(
    new DesktopTailscaleServePathValidationError({
      servePath: requested,
      issue: validation.issue,
      detail: validation.message,
    }),
  );
}

const make = Effect.gen(function* () {
  const config = yield* DesktopConfig.DesktopConfig;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const networkInterfaces = yield* DesktopNetworkInterfaces.DesktopNetworkInterfaces;
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const httpClient = yield* HttpClient.HttpClient;
  const desktopSettings = yield* DesktopAppSettingsService.DesktopAppSettings;
  const defaultTailscaleServePath = environment.defaultDesktopSettings.tailscaleServePath;
  const stateRef = yield* Ref.make(initialRuntimeState(defaultTailscaleServePath));

  // Cache the `tailscale status` spawn for the TTL. On macOS, the Mac App
  // Store Tailscale CLI lives inside Tailscale's sandbox container, so each
  // spawn re-triggers the "Other apps" TCC prompt.
  const cachedTailscaleMagicDnsName = yield* Effect.cachedWithTTL(
    readTailscaleStatus.pipe(
      Effect.map((status) => status.magicDnsName),
      Effect.orElseSucceed(() => null),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
    ),
    TAILSCALE_STATUS_CACHE_TTL,
  );

  const readNetworkInterfaces = networkInterfaces.read;

  const getState = Ref.get(stateRef).pipe(Effect.map(toContractState));
  const backendConfig = Ref.get(stateRef).pipe(Effect.map(toBackendConfig));
  const isTailscaleServeRouteExpected = (state: RuntimeState): boolean =>
    state.tailscaleServeEnabled || Option.isSome(config.tailscaleServePath);

  const ensureTailscaleServeRoute = Effect.fn("desktop.serverExposure.ensureTailscaleServeRoute")(
    function* (input: {
      readonly state: RuntimeState;
      readonly servePort?: number;
      readonly servePath?: string;
    }) {
      yield* ensureTailscaleServe({
        localPort: input.state.port,
        servePort: input.servePort ?? input.state.tailscaleServePort,
        servePath: input.servePath ?? input.state.tailscaleServePath,
        localHost: DESKTOP_LOOPBACK_HOST,
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner));
    },
  );

  const assertTailscaleServeRouteReservation = Effect.fn(
    "desktop.serverExposure.assertTailscaleServeRouteReservation",
  )(function* (servePath: string) {
    const conflict = checkDesktopTailscaleReservedServeRoute({
      appRoot: environment.appRoot,
      route: servePath,
    });
    if (conflict === null) {
      return;
    }
    return yield* new DesktopTailscaleServeRouteReservationError({
      servePath,
      expectedBranch: conflict.expectedBranch,
      expectedWorktreeBasename: conflict.expectedWorktreeBasename,
      expectedDescription: conflict.expectedDescription,
      actualBranch: conflict.actualBranch,
      actualWorktreePath: conflict.actualWorktreePath,
      detail: conflict.message,
    });
  });

  const assertTailscaleServeRouteAvailable = Effect.fn(
    "desktop.serverExposure.assertTailscaleServeRouteAvailable",
  )(function* (input: {
    readonly state: RuntimeState;
    readonly servePort: number;
    readonly servePath: string;
  }) {
    yield* assertTailscaleServeRouteReservation(input.servePath);
    yield* assertTailscaleServePathAvailable({
      servePort: input.servePort,
      servePath: input.servePath,
      localPort: input.state.port,
      localHost: DESKTOP_LOOPBACK_HOST,
    }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner));
  });

  const unavailableRouteProbe = (input: {
    readonly servePath: string | null;
    readonly servePort: number;
    readonly message: string;
  }): DesktopTailscaleServeRouteProbeResult => ({
    status: "unavailable",
    available: false,
    owned: false,
    conflict: false,
    servePath: input.servePath,
    servePort: input.servePort,
    expectedProxyUrl: null,
    existingProxyUrl: null,
    message: input.message,
  });

  const checkTailscaleServeRoute = Effect.fn("desktop.serverExposure.checkTailscaleServeRoute")(
    function* (input: DesktopTailscaleServeRouteProbeInput) {
      const current = yield* Ref.get(stateRef);
      const servePort = input.servePort ?? current.tailscaleServePort;
      const validation = validateTailscaleServeUiRoute(input.servePath);

      if (!validation.valid) {
        return {
          status: "invalid",
          available: false,
          owned: false,
          conflict: true,
          servePath: null,
          servePort,
          expectedProxyUrl: null,
          existingProxyUrl: null,
          message: validation.message,
        } satisfies DesktopTailscaleServeRouteProbeResult;
      }

      const reservedConflict = checkDesktopTailscaleReservedServeRoute({
        appRoot: environment.appRoot,
        route: validation.route,
      });
      if (reservedConflict !== null) {
        return {
          status: "reserved-conflict",
          available: false,
          owned: false,
          conflict: true,
          servePath: validation.route,
          servePort,
          expectedProxyUrl: `http://${DESKTOP_LOOPBACK_HOST}:${current.port}`,
          existingProxyUrl: null,
          message: reservedConflict.message,
        } satisfies DesktopTailscaleServeRouteProbeResult;
      }

      const availability = yield* readTailscaleServeRouteAvailability({
        servePort,
        servePath: validation.route,
        localPort: current.port,
        localHost: DESKTOP_LOOPBACK_HOST,
      }).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
        Effect.catch((cause) =>
          Effect.succeed(
            unavailableRouteProbe({
              servePath: validation.route,
              servePort,
              message:
                cause instanceof Error
                  ? cause.message
                  : "Tailscale Serve route status is unavailable.",
            }),
          ),
        ),
      );

      if (availability.status === "unavailable") {
        return availability;
      }

      return {
        status: availability.status,
        available: availability.available,
        owned: availability.owned,
        conflict: availability.conflict,
        servePath: availability.servePath,
        servePort: availability.servePort,
        expectedProxyUrl: availability.expectedProxyUrl,
        existingProxyUrl: availability.existingProxyUrl,
        message:
          availability.status === "available"
            ? "Available"
            : availability.status === "owned"
              ? "Already configured for this backend"
              : `Route ${availability.servePath} is already taken by ${availability.existingProxyUrl}. This backend expects ${availability.expectedProxyUrl}.`,
      } satisfies DesktopTailscaleServeRouteProbeResult;
    },
  );

  const cleanupPreviousTailscaleServeRoute = Effect.fn(
    "desktop.serverExposure.cleanupPreviousTailscaleServeRoute",
  )(function* (input: {
    readonly previous: RuntimeState;
    readonly nextServePort: number;
    readonly nextServePath: string;
  }) {
    if (!input.previous.tailscaleServeEnabled) {
      return null;
    }
    if (
      input.previous.tailscaleServePort === input.nextServePort &&
      input.previous.tailscaleServePath === input.nextServePath
    ) {
      return null;
    }

    const result = yield* disableTailscaleServeIfOwned({
      servePort: input.previous.tailscaleServePort,
      servePath: input.previous.tailscaleServePath,
      localPort: input.previous.port,
      localHost: DESKTOP_LOOPBACK_HOST,
    }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner));

    return {
      disabled: result.disabled,
      existingProxyUrl: result.existingProxyUrl,
    } satisfies DesktopTailscalePreviousRouteCleanup;
  });

  const configureFromSettings = Effect.fn("desktop.serverExposure.configureFromSettings")(
    function* ({ port }: { readonly port: number }) {
      yield* Effect.annotateCurrentSpan({ port });
      const settings = yield* desktopSettings.get;
      const currentNetworkInterfaces = yield* readNetworkInterfaces;
      const resolved = resolveRuntimeState({
        requestedMode: settings.serverExposureMode,
        settings,
        port,
        networkInterfaces: currentNetworkInterfaces,
        advertisedHostOverride: config.desktopLanHostOverride,
        defaultTailscaleServePath,
      });
      yield* Ref.set(stateRef, resolved.state);
      return toContractState(resolved.state);
    },
  );

  const setMode = Effect.fn("desktop.serverExposure.setMode")(function* (
    mode: DesktopServerExposureMode,
  ) {
    yield* Effect.annotateCurrentSpan({ mode });
    const previous = yield* Ref.get(stateRef);
    const currentSettings = yield* desktopSettings.get;
    const nextSettings = {
      ...currentSettings,
      serverExposureMode: mode,
    };
    const currentNetworkInterfaces = yield* readNetworkInterfaces;
    const resolved = resolveRuntimeState({
      requestedMode: mode,
      settings: nextSettings,
      port: previous.port,
      networkInterfaces: currentNetworkInterfaces,
      advertisedHostOverride: config.desktopLanHostOverride,
      defaultTailscaleServePath,
    });

    if (resolved.unavailable) {
      return yield* new DesktopServerExposureNoNetworkAddressError({ port: previous.port });
    }

    const change = yield* desktopSettings.setServerExposureMode(mode).pipe(
      Effect.mapError(
        (cause) =>
          new DesktopServerExposureModePersistenceError({
            mode,
            cause,
          }),
      ),
    );

    yield* Ref.set(stateRef, resolved.state);
    return {
      state: toContractState(resolved.state),
      requiresRelaunch: change.changed || requiresBackendRelaunch(previous, resolved.state),
    };
  });

  const setTailscaleServeEnabled = Effect.fn("desktop.serverExposure.setTailscaleServeEnabled")(
    function* (input: {
      readonly enabled: boolean;
      readonly port?: number;
      readonly servePath?: string;
    }) {
      yield* Effect.annotateCurrentSpan({
        enabled: input.enabled,
        ...(input.port === undefined ? {} : { port: input.port }),
        ...(input.servePath === undefined ? {} : { servePath: input.servePath }),
      });
      const previous = yield* Ref.get(stateRef);
      const result = yield* desktopSettings
        .setTailscaleServe({
          enabled: input.enabled,
          port: Option.fromNullishOr(input.port),
          servePath: Option.fromNullishOr(input.servePath),
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new DesktopTailscaleServePersistenceError({
                enabled: input.enabled,
                port: input.port ?? null,
                cause,
              }),
          ),
        );

      const nextState = yield* Ref.updateAndGet(stateRef, (current) => ({
        ...current,
        tailscaleServeEnabled: result.settings.tailscaleServeEnabled,
        tailscaleServePort: result.settings.tailscaleServePort,
        tailscaleServePath: resolveTailscaleServePath({
          settings: result.settings,
          defaultPath: current.defaultTailscaleServePath,
        }),
      }));

      return {
        state: toContractState(nextState),
        requiresRelaunch:
          result.changed &&
          (previous.tailscaleServeEnabled !== nextState.tailscaleServeEnabled ||
            previous.tailscaleServePath !== nextState.tailscaleServePath ||
            previous.tailscaleServePort !== nextState.tailscaleServePort),
      };
    },
  );

  const getTailscaleAccessState = Effect.fn("desktop.serverExposure.getTailscaleAccessState")(
    function* (input?: { readonly probe?: boolean }) {
      const state = yield* Ref.get(stateRef);
      const statusResult = yield* readTailscaleStatus.pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
        Effect.result,
      );

      if (Result.isFailure(statusResult)) {
        return {
          enabled: state.tailscaleServeEnabled,
          available: false,
          defaultServePath: state.defaultTailscaleServePath,
          servePath: state.tailscaleServePath,
          servePort: state.tailscaleServePort,
          magicDnsName: null,
          tailnetIp: null,
          httpsUrl: null,
          probeStatus: "unknown" as const,
          routeProbe: null,
          message:
            statusResult.failure instanceof Error
              ? statusResult.failure.message
              : "Tailscale is unavailable.",
        };
      }

      const status = statusResult.success;
      const httpsUrl = status.magicDnsName
        ? buildTailscaleHttpsBaseUrl({
            magicDnsName: status.magicDnsName,
            servePort: state.tailscaleServePort,
            servePath: state.tailscaleServePath,
          })
        : null;
      const probeStatus =
        input?.probe === true && httpsUrl
          ? yield* probeTailscaleHttpsEndpoint({ baseUrl: httpsUrl }).pipe(
              Effect.provideService(HttpClient.HttpClient, httpClient),
              Effect.flatMap((reachable) => {
                if (reachable) {
                  return Effect.succeed("reachable" as const);
                }
                return readTailscaleServeRouteStatus({
                  servePort: state.tailscaleServePort,
                  servePath: state.tailscaleServePath,
                  localPort: state.port,
                  localHost: DESKTOP_LOOPBACK_HOST,
                }).pipe(
                  Effect.provideService(
                    ChildProcessSpawner.ChildProcessSpawner,
                    childProcessSpawner,
                  ),
                  Effect.match({
                    onFailure: () => "unreachable" as const,
                    onSuccess: (routeStatus) =>
                      routeStatus.configured ? ("configured" as const) : ("unreachable" as const),
                  }),
                );
              }),
            )
          : ("unknown" as const);
      const routeProbe =
        input?.probe === true
          ? yield* checkTailscaleServeRoute({
              servePath: state.tailscaleServePath,
              servePort: state.tailscaleServePort,
            })
          : null;

      return {
        enabled: state.tailscaleServeEnabled,
        available: status.magicDnsName !== null,
        defaultServePath: state.defaultTailscaleServePath,
        servePath: state.tailscaleServePath,
        servePort: state.tailscaleServePort,
        magicDnsName: status.magicDnsName,
        tailnetIp: status.tailnetIpv4Addresses[0] ?? null,
        httpsUrl,
        probeStatus,
        routeProbe,
        message:
          status.magicDnsName === null
            ? "Tailscale is running, but MagicDNS is not available for this device."
            : probeStatus === "configured"
              ? "Tailscale Serve is configured, but this machine could not complete a local HTTPS self-probe."
              : null,
      };
    },
  );

  const applyTailscaleAccessSettings = Effect.fn(
    "desktop.serverExposure.applyTailscaleAccessSettings",
  )(function* (input: {
    readonly enabled: boolean;
    readonly servePort?: number;
    readonly servePath?: string;
    readonly probeAfterApply?: boolean;
  }) {
    const current = yield* Ref.get(stateRef);
    const servePort = input.servePort ?? current.tailscaleServePort;
    const servePath = yield* normalizeRequestedTailscaleServePath(
      input.servePath,
      current.tailscaleServePath,
    );
    yield* assertTailscaleServeRouteReservation(servePath);

    if (input.enabled) {
      yield* assertTailscaleServeRouteAvailable({
        state: current,
        servePort,
        servePath,
      });
      yield* ensureTailscaleServeRoute({
        state: current,
        servePort,
        servePath,
      });
    }

    const change = yield* setTailscaleServeEnabled({
      enabled: input.enabled,
      port: servePort,
      servePath,
    });

    const previousRouteCleanup = yield* cleanupPreviousTailscaleServeRoute({
      previous: current,
      nextServePort: servePort,
      nextServePath: servePath,
    });

    const state = yield* getTailscaleAccessState({ probe: input.probeAfterApply === true });
    return {
      state,
      requiresRelaunch: change.requiresRelaunch,
      previousRouteCleanup,
    } satisfies DesktopTailscaleAccessChange;
  });

  const enableTailscaleAccess = Effect.fn("desktop.serverExposure.enableTailscaleAccess")(
    function* (input?: DesktopTailscaleAccessEnableInput) {
      const applied = yield* applyTailscaleAccessSettings({
        enabled: true,
        ...(input?.servePort === undefined ? {} : { servePort: input.servePort }),
        ...(input?.servePath === undefined ? {} : { servePath: input.servePath }),
      });
      const state = yield* Ref.get(stateRef);
      return {
        state: toContractState(state),
        requiresRelaunch: applied.requiresRelaunch,
      };
    },
  );

  const updateTailscaleServePath = Effect.fn("desktop.serverExposure.updateTailscaleServePath")(
    function* (input: { readonly servePath: string }) {
      const current = yield* Ref.get(stateRef);
      const servePath = yield* normalizeRequestedTailscaleServePath(
        input.servePath,
        current.defaultTailscaleServePath,
      );

      return yield* applyTailscaleAccessSettings({
        enabled: current.tailscaleServeEnabled,
        servePort: current.tailscaleServePort,
        servePath,
        probeAfterApply: false,
      });
    },
  );

  const disableTailscaleAccess = Effect.gen(function* () {
    const current = yield* Ref.get(stateRef);
    yield* disableTailscaleServeIfOwned({
      servePort: current.tailscaleServePort,
      servePath: current.tailscaleServePath,
      localPort: current.port,
      localHost: DESKTOP_LOOPBACK_HOST,
    }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner));
    return yield* setTailscaleServeEnabled({
      enabled: false,
      port: current.tailscaleServePort,
      servePath: current.tailscaleServePath,
    });
  }).pipe(Effect.withSpan("desktop.serverExposure.disableTailscaleAccess"));

  const repairTailscaleAccess = Effect.gen(function* () {
    const current = yield* Ref.get(stateRef);
    if (!current.tailscaleServeEnabled) {
      return yield* getTailscaleAccessState({ probe: true });
    }
    const applied = yield* applyTailscaleAccessSettings({
      enabled: true,
      servePort: current.tailscaleServePort,
      servePath: current.tailscaleServePath,
      probeAfterApply: true,
    });
    return applied.state;
  }).pipe(Effect.withSpan("desktop.serverExposure.repairTailscaleAccess"));

  const probeTailscaleAccess = Effect.gen(function* () {
    const probed = yield* getTailscaleAccessState({ probe: true });
    if (probed.probeStatus === "reachable") {
      return probed;
    }

    const current = yield* Ref.get(stateRef);
    if (
      !isTailscaleServeRouteExpected(current) ||
      !probed.available ||
      probed.magicDnsName === null ||
      probed.httpsUrl === null ||
      (probed.probeStatus !== "configured" && probed.probeStatus !== "unreachable")
    ) {
      return probed;
    }

    const repairResult = yield* Effect.gen(function* () {
      yield* assertTailscaleServeRouteAvailable({
        state: current,
        servePort: current.tailscaleServePort,
        servePath: current.tailscaleServePath,
      });
      yield* ensureTailscaleServeRoute({ state: current });
    }).pipe(Effect.result);
    if (Result.isFailure(repairResult)) {
      return {
        ...probed,
        message:
          repairResult.failure instanceof Error
            ? repairResult.failure.message
            : "Failed to repair Tailscale HTTPS.",
      };
    }

    return yield* getTailscaleAccessState({ probe: true });
  }).pipe(Effect.withSpan("desktop.serverExposure.probeTailscaleAccess"));

  const syncTailscaleServeRouteOnBackendReady = Effect.gen(function* () {
    const state = yield* Ref.get(stateRef);
    const configuredExternalServePath = Option.getOrUndefined(config.tailscaleServePath);
    const shouldSync =
      state.requestedMode === "network-accessible" &&
      (state.tailscaleServeEnabled || configuredExternalServePath !== undefined);

    if (!shouldSync) {
      return;
    }

    const expectedProxyUrl = `http://${DESKTOP_LOOPBACK_HOST}:${state.port}`;
    const routeStatus = yield* readTailscaleServeRouteStatus({
      servePort: state.tailscaleServePort,
      servePath: state.tailscaleServePath,
      localPort: state.port,
      localHost: DESKTOP_LOOPBACK_HOST,
    }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
      Effect.orElseSucceed(() => ({ configured: false, proxyUrl: null })),
    );

    if (routeStatus.configured && routeStatus.proxyUrl === expectedProxyUrl) {
      return;
    }

    if (routeStatus.proxyUrl !== null && routeStatus.proxyUrl !== expectedProxyUrl) {
      yield* Effect.logWarning("Tailscale Serve route is already owned by another backend.", {
        servePath: state.tailscaleServePath,
        servePort: state.tailscaleServePort,
        existingProxyUrl: routeStatus.proxyUrl,
        expectedProxyUrl,
      });
      return;
    }

    const reservedConflict = checkDesktopTailscaleReservedServeRoute({
      appRoot: environment.appRoot,
      route: state.tailscaleServePath,
    });
    if (reservedConflict !== null) {
      yield* Effect.logWarning("Tailscale Serve route is reserved for another worktree.", {
        servePath: state.tailscaleServePath,
        actualWorktreePath: reservedConflict.actualWorktreePath,
        actualBranch: reservedConflict.actualBranch,
      });
      return;
    }

    yield* ensureTailscaleServeRoute({ state });
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("Failed to sync Tailscale Serve route on backend ready.", { cause }),
    ),
    Effect.withSpan("desktop.serverExposure.syncTailscaleServeRouteOnBackendReady"),
  );

  const getAdvertisedEndpoints = Effect.gen(function* () {
    const state = yield* Ref.get(stateRef);
    const currentNetworkInterfaces = yield* readNetworkInterfaces;
    const configuredTailscaleServePath = Option.getOrUndefined(config.tailscaleServePath);
    const tailscaleServePath = configuredTailscaleServePath ?? state.tailscaleServePath;
    const isExternallyConfigured = configuredTailscaleServePath !== undefined;
    const coreEndpoints = resolveDesktopCoreAdvertisedEndpoints({
      port: state.port,
      exposure: toResolvedExposure(state),
      customHttpsEndpointUrls: config.desktopHttpsEndpointUrls,
    });

    // Don't spawn the Tailscale CLI when the user hasn't opted into any
    // network exposure. The spawn itself triggers a macOS "Other apps"
    // TCC prompt on Mac App Store Tailscale builds.
    if (
      state.mode !== "network-accessible" &&
      !state.tailscaleServeEnabled &&
      !isExternallyConfigured
    ) {
      return coreEndpoints;
    }

    const tailscaleMagicDnsName = yield* cachedTailscaleMagicDnsName;
    const tailscaleEndpoints = yield* resolveTailscaleAdvertisedEndpoints({
      port: state.port,
      serveEnabled: state.tailscaleServeEnabled,
      servePort: state.tailscaleServePort,
      servePath: tailscaleServePath,
      externalServeConfigured: isExternallyConfigured,
      networkInterfaces: currentNetworkInterfaces,
      magicDnsName: tailscaleMagicDnsName,
    }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
      Effect.provideService(HttpClient.HttpClient, httpClient),
    );
    return [...coreEndpoints, ...tailscaleEndpoints];
  }).pipe(Effect.withSpan("desktop.serverExposure.getAdvertisedEndpoints"));

  return DesktopServerExposure.of({
    getState,
    backendConfig,
    configureFromSettings,
    setMode,
    setTailscaleServeEnabled,
    getTailscaleAccessState,
    enableTailscaleAccess,
    checkTailscaleServeRoute,
    updateTailscaleServePath,
    disableTailscaleAccess,
    repairTailscaleAccess,
    probeTailscaleAccess,
    syncTailscaleServeRouteOnBackendReady,
    getAdvertisedEndpoints,
  });
});

export const layer = Layer.effect(DesktopServerExposure, make);
