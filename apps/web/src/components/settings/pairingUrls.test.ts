import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  resolveAdvertisedEndpointPairingUrl,
  resolveDesktopPairingUrl,
  resolveHostedPairingUrl,
} from "./pairingUrls";

describe("settings pairing URL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses direct backend pairing URLs for HTTP endpoints", () => {
    expect(resolveHostedPairingUrl("http://192.168.1.44:3773", "PAIRCODE")).toBeNull();
    expect(resolveDesktopPairingUrl("http://192.168.1.44:3773", "PAIRCODE")).toBe(
      "http://192.168.1.44:3773/pair#token=PAIRCODE",
    );
  });

  it("uses hosted pairing URLs for HTTPS endpoints", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.t3.codes");

    expect(resolveHostedPairingUrl("https://host.tailnet.example.ts.net:3773", "PAIRCODE")).toBe(
      "https://preview.t3.codes/pair?host=https%3A%2F%2Fhost.tailnet.example.ts.net%3A3773%2F#token=PAIRCODE",
    );
  });

  it("keeps direct and hosted pairing URLs path-prefixed", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.t3.codes");

    expect(
      resolveDesktopPairingUrl("https://host.tailnet.example.ts.net/t3code-staging/", "PAIRCODE"),
    ).toBe("https://host.tailnet.example.ts.net/t3code-staging/pair#token=PAIRCODE");
    expect(
      resolveHostedPairingUrl("https://host.tailnet.example.ts.net/t3code-staging/", "PAIRCODE"),
    ).toBe(
      "https://preview.t3.codes/pair?host=https%3A%2F%2Fhost.tailnet.example.ts.net%2Ft3code-staging%2F#token=PAIRCODE",
    );
  });

  it("uses direct pairing URLs for advertised Tailscale HTTPS endpoints", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.t3.codes");

    expect(
      resolveAdvertisedEndpointPairingUrl(
        {
          id: "tailscale-magicdns:https://giggabit.tailfb378a.ts.net/t3code-staging/",
          label: "Tailscale HTTPS",
          provider: {
            id: "tailscale",
            label: "Tailscale",
            kind: "private-network",
            isAddon: true,
          },
          httpBaseUrl: "https://giggabit.tailfb378a.ts.net/t3code-staging/",
          wsBaseUrl: "wss://giggabit.tailfb378a.ts.net/t3code-staging/",
          reachability: "private-network",
          compatibility: {
            hostedHttpsApp: "compatible",
            desktopApp: "compatible",
          },
          source: "desktop-addon",
          status: "available",
        },
        "HABR8JT92FCD",
      ),
    ).toBe("https://giggabit.tailfb378a.ts.net/t3code-staging/?token=HABR8JT92FCD");
  });
});
