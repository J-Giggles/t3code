import { buildPairingPageUrl, normalizeHttpBaseUrl } from "@t3tools/shared/advertisedEndpoint";
import type { AdvertisedEndpoint } from "@t3tools/contracts";

import { buildHostedPairingUrl } from "../../hostedPairing";

export function resolveDesktopPairingUrl(endpointUrl: string, credential: string): string {
  return buildPairingPageUrl(endpointUrl, credential);
}

export function resolveHostedPairingUrl(endpointUrl: string, credential: string): string | null {
  const url = new URL(normalizeHttpBaseUrl(endpointUrl));
  if (url.protocol !== "https:") {
    return null;
  }

  return buildHostedPairingUrl({
    host: url.toString(),
    token: credential,
  });
}

export function resolveDirectAppPairingUrl(endpointUrl: string, credential: string): string {
  const url = new URL(normalizeHttpBaseUrl(endpointUrl));
  url.searchParams.set("token", credential);
  url.hash = "";
  return url.toString();
}

export function isTailscaleHttpsEndpoint(endpoint: AdvertisedEndpoint): boolean {
  return endpoint.id.startsWith("tailscale-magicdns:");
}

export function resolveAdvertisedEndpointPairingUrl(
  endpoint: AdvertisedEndpoint,
  credential: string,
): string {
  if (isTailscaleHttpsEndpoint(endpoint)) {
    return resolveDirectAppPairingUrl(endpoint.httpBaseUrl, credential);
  }

  if (endpoint.compatibility.hostedHttpsApp === "compatible") {
    return (
      resolveHostedPairingUrl(endpoint.httpBaseUrl, credential) ??
      resolveDesktopPairingUrl(endpoint.httpBaseUrl, credential)
    );
  }
  return resolveDesktopPairingUrl(endpoint.httpBaseUrl, credential);
}
