import type {
  AdvertisedEndpoint,
  DesktopBridge,
  DesktopServerExposureState,
  DesktopTailscaleAccessState,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";

const DESKTOP_NETWORK_ACCESS_STALE_TIME_MS = 30_000;

type DesktopNetworkAccessBridge = Pick<
  DesktopBridge,
  "getAdvertisedEndpoints" | "getServerExposureState" | "getTailscaleAccessState"
>;

export interface DesktopNetworkAccessSnapshot {
  readonly advertisedEndpoints: ReadonlyArray<AdvertisedEndpoint>;
  readonly serverExposureState: DesktopServerExposureState;
  readonly tailscaleAccessState: DesktopTailscaleAccessState;
}

class DesktopNetworkAccessUnavailableError extends Schema.TaggedErrorClass<DesktopNetworkAccessUnavailableError>()(
  "DesktopNetworkAccessUnavailableError",
  {},
) {
  override get message(): string {
    return "Desktop network access is unavailable.";
  }
}

class DesktopServerExposureStateLoadError extends Schema.TaggedErrorClass<DesktopServerExposureStateLoadError>()(
  "DesktopServerExposureStateLoadError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to load desktop server exposure state.";
  }
}

class DesktopAdvertisedEndpointsLoadError extends Schema.TaggedErrorClass<DesktopAdvertisedEndpointsLoadError>()(
  "DesktopAdvertisedEndpointsLoadError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to load advertised desktop endpoints.";
  }
}

class DesktopTailscaleAccessStateLoadError extends Schema.TaggedErrorClass<DesktopTailscaleAccessStateLoadError>()(
  "DesktopTailscaleAccessStateLoadError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to load desktop Tailscale access state.";
  }
}

function getDesktopNetworkAccessBridge(): DesktopNetworkAccessBridge | undefined {
  return typeof window === "undefined" ? undefined : window.desktopBridge;
}

export function createDesktopNetworkAccessStateAtom(
  getBridge: () => DesktopNetworkAccessBridge | undefined,
) {
  const loadDesktopNetworkAccess = Effect.fn("loadDesktopNetworkAccess")(function* () {
    const bridge = getBridge();
    if (!bridge) {
      return yield* new DesktopNetworkAccessUnavailableError();
    }
    const [serverExposureState, advertisedEndpoints, tailscaleAccessState] = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => bridge.getServerExposureState(),
          catch: (cause) => new DesktopServerExposureStateLoadError({ cause }),
        }),
        Effect.tryPromise({
          try: () => bridge.getAdvertisedEndpoints(),
          catch: (cause) => new DesktopAdvertisedEndpointsLoadError({ cause }),
        }),
        Effect.tryPromise({
          try: () => bridge.getTailscaleAccessState(),
          catch: (cause) => new DesktopTailscaleAccessStateLoadError({ cause }),
        }),
      ],
      { concurrency: "unbounded" },
    );
    return {
      advertisedEndpoints,
      serverExposureState,
      tailscaleAccessState,
    } satisfies DesktopNetworkAccessSnapshot;
  });

  return Atom.make(loadDesktopNetworkAccess()).pipe(
    Atom.swr({
      staleTime: DESKTOP_NETWORK_ACCESS_STALE_TIME_MS,
      revalidateOnMount: true,
    }),
    Atom.keepAlive,
    Atom.withLabel("desktop:network-access"),
  );
}

export const desktopNetworkAccessStateAtom = createDesktopNetworkAccessStateAtom(
  getDesktopNetworkAccessBridge,
);

export function refreshDesktopNetworkAccessState(): void {
  appAtomRegistry.refresh(desktopNetworkAccessStateAtom);
}
