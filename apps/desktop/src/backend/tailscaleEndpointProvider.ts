import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import type { AdvertisedEndpoint, AdvertisedEndpointProvider } from "@t3tools/contracts";
import {
  buildTailscaleHttpsBaseUrl,
  isTailscaleIpv4Address,
  parseTailscaleMagicDnsName,
  readTailscaleStatus,
} from "@t3tools/tailscale";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { NetworkInterfaces } from "./DesktopNetworkInterfaces.ts";

export { isTailscaleIpv4Address, parseTailscaleMagicDnsName } from "@t3tools/tailscale";

const TAILSCALE_ENDPOINT_PROVIDER: AdvertisedEndpointProvider = {
  id: "tailscale",
  label: "Tailscale",
  kind: "private-network",
  isAddon: true,
};

function resolveTailscaleIpAdvertisedEndpoints(input: {
  readonly port: number;
  readonly networkInterfaces: NetworkInterfaces;
}): readonly AdvertisedEndpoint[] {
  const seen = new Set<string>();
  const endpoints: AdvertisedEndpoint[] = [];

  for (const interfaceAddresses of Object.values(input.networkInterfaces)) {
    if (!interfaceAddresses) continue;

    for (const address of interfaceAddresses) {
      if (address.internal) continue;
      if (address.family !== "IPv4") continue;
      if (!isTailscaleIpv4Address(address.address)) continue;
      if (seen.has(address.address)) continue;
      seen.add(address.address);

      endpoints.push(
        createAdvertisedEndpoint({
          provider: TAILSCALE_ENDPOINT_PROVIDER,
          source: "desktop-addon",
          id: `tailscale-ip:http://${address.address}:${input.port}`,
          label: "Tailscale IP",
          httpBaseUrl: `http://${address.address}:${input.port}`,
          reachability: "private-network",
          status: "available",
          description: "Reachable from devices on the same Tailnet.",
        }),
      );
    }
  }

  return endpoints;
}

function resolveTailscaleMagicDnsAdvertisedEndpoint(input: {
  readonly dnsName: string | null;
  readonly serveEnabled: boolean;
  readonly servePort?: number;
  readonly servePath?: string;
  readonly externalServeConfigured?: boolean;
}): Option.Option<AdvertisedEndpoint> {
  if (!input.dnsName) {
    return Option.none();
  }

  const httpBaseUrl = buildTailscaleHttpsBaseUrl({
    magicDnsName: input.dnsName,
    ...(input.servePort === undefined ? {} : { servePort: input.servePort }),
    ...(input.servePath === undefined ? {} : { servePath: input.servePath }),
  });
  const isServeConfigured = input.serveEnabled || input.externalServeConfigured === true;

  return Option.some(
    createAdvertisedEndpoint({
      provider: TAILSCALE_ENDPOINT_PROVIDER,
      source: "desktop-addon",
      id: `tailscale-magicdns:${httpBaseUrl}`,
      label: "Tailscale HTTPS",
      httpBaseUrl,
      reachability: "private-network",
      hostedHttpsCompatibility: isServeConfigured ? "compatible" : "requires-configuration",
      status: isServeConfigured ? "available" : "unavailable",
      description: isServeConfigured
        ? "HTTPS endpoint served by Tailscale Serve."
        : "MagicDNS hostname. Configure Tailscale Serve for HTTPS access.",
    }),
  );
}

export const resolveTailscaleAdvertisedEndpoints = Effect.fn("resolveTailscaleAdvertisedEndpoints")(
  function* (input: {
    readonly port: number;
    readonly serveEnabled?: boolean;
    readonly servePort?: number;
    readonly servePath?: string;
    readonly externalServeConfigured?: boolean;
    readonly networkInterfaces: NetworkInterfaces;
    readonly statusJson?: string | null;
    readonly magicDnsName?: string | null;
  }): Effect.fn.Return<
    readonly AdvertisedEndpoint[],
    never,
    ChildProcessSpawner.ChildProcessSpawner
  > {
    const ipEndpoints = resolveTailscaleIpAdvertisedEndpoints(input);
    const dnsName =
      input.magicDnsName !== undefined
        ? input.magicDnsName
        : input.statusJson === undefined
          ? yield* readTailscaleStatus.pipe(
              Effect.map((status) => status.magicDnsName),
              Effect.orElseSucceed(() => null),
            )
          : input.statusJson
            ? yield* parseTailscaleMagicDnsName(input.statusJson).pipe(
                Effect.orElseSucceed(() => null),
              )
            : null;
    const magicDnsEndpoint = resolveTailscaleMagicDnsAdvertisedEndpoint({
      dnsName,
      serveEnabled: input.serveEnabled === true,
      ...(input.servePort === undefined ? {} : { servePort: input.servePort }),
      ...(input.servePath === undefined ? {} : { servePath: input.servePath }),
      ...(input.externalServeConfigured === undefined
        ? {}
        : { externalServeConfigured: input.externalServeConfigured }),
    });

    return Option.match(magicDnsEndpoint, {
      onNone: () => ipEndpoints,
      onSome: (endpoint) => [...ipEndpoints, endpoint],
    });
  },
);
