import type {
  AdvertisedEndpoint,
  AdvertisedEndpointHostedHttpsCompatibility,
  AdvertisedEndpointProvider,
  AdvertisedEndpointReachability,
  AdvertisedEndpointSource,
  AdvertisedEndpointStatus,
} from "@t3tools/contracts";

import { setPairingTokenOnUrl } from "./remote.ts";

export interface CreateAdvertisedEndpointInput {
  readonly id: string;
  readonly label: string;
  readonly provider: AdvertisedEndpointProvider;
  readonly httpBaseUrl: string;
  readonly reachability: AdvertisedEndpointReachability;
  readonly hostedHttpsCompatibility?: AdvertisedEndpointHostedHttpsCompatibility;
  readonly desktopCompatibility?: "compatible" | "unknown";
  readonly source: AdvertisedEndpointSource;
  readonly status?: AdvertisedEndpointStatus;
  readonly isDefault?: boolean;
  readonly description?: string;
}

const PAIRING_PAGE_PATH = "/pair";

export function normalizeHttpBaseUrl(rawValue: string): string {
  const url = new URL(rawValue);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Endpoint must use HTTP or HTTPS. Received ${url.protocol}`);
  }

  if (url.pathname === PAIRING_PAGE_PATH || url.pathname.endsWith(`${PAIRING_PAGE_PATH}/`)) {
    url.pathname = url.pathname.slice(0, -PAIRING_PAGE_PATH.length) || "/";
  } else if (url.pathname.endsWith(PAIRING_PAGE_PATH)) {
    url.pathname = url.pathname.slice(0, -PAIRING_PAGE_PATH.length) || "/";
  }

  if (url.pathname !== "/" && !url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function joinHttpBasePath(httpBaseUrl: string, pathname: string): string {
  const base = new URL(normalizeHttpBaseUrl(httpBaseUrl));
  const basePath =
    base.pathname === "/"
      ? ""
      : base.pathname.endsWith("/")
        ? base.pathname.slice(0, -1)
        : base.pathname;
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  base.pathname = basePath.length === 0 ? suffix : `${basePath}${suffix}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

export function resolveWsConnectionPath(httpBaseUrl: string): string {
  const base = new URL(normalizeHttpBaseUrl(httpBaseUrl));
  const basePath =
    base.pathname === "/"
      ? ""
      : base.pathname.endsWith("/")
        ? base.pathname.slice(0, -1)
        : base.pathname;
  return basePath.length === 0 ? "/ws" : `${basePath}/ws`;
}

export function buildPairingPageUrl(httpBaseUrl: string, token: string): string {
  return setPairingTokenOnUrl(
    new URL(joinHttpBasePath(httpBaseUrl, PAIRING_PAGE_PATH)),
    token,
  ).toString();
}

export function deriveWsBaseUrl(httpBaseUrl: string): string {
  const url = new URL(normalizeHttpBaseUrl(httpBaseUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function classifyHostedHttpsCompatibility(
  httpBaseUrl: string,
  fallback: AdvertisedEndpointHostedHttpsCompatibility = "unknown",
): AdvertisedEndpointHostedHttpsCompatibility {
  const url = new URL(normalizeHttpBaseUrl(httpBaseUrl));
  if (url.protocol === "http:") {
    return "mixed-content-blocked";
  }
  return fallback === "mixed-content-blocked" ? "unknown" : fallback;
}

export function createAdvertisedEndpoint(input: CreateAdvertisedEndpointInput): AdvertisedEndpoint {
  const httpBaseUrl = normalizeHttpBaseUrl(input.httpBaseUrl);
  return {
    id: input.id,
    label: input.label,
    provider: input.provider,
    httpBaseUrl,
    wsBaseUrl: deriveWsBaseUrl(httpBaseUrl),
    reachability: input.reachability,
    compatibility: {
      hostedHttpsApp:
        input.hostedHttpsCompatibility ?? classifyHostedHttpsCompatibility(httpBaseUrl),
      desktopApp: input.desktopCompatibility ?? "compatible",
    },
    source: input.source,
    status: input.status ?? "available",
    ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}
