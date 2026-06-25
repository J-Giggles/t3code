import { describe, expect, it } from "vitest";

import {
  buildTailscaleMagicDnsResolutionErrorMessage,
  probeTailscaleMagicDnsResolution,
  TailscaleMagicDnsResolutionError,
} from "./tailscale.ts";

describe("Tailscale MagicDNS resolution", () => {
  it("reports resolver failures with a split DNS hint", () => {
    const message = buildTailscaleMagicDnsResolutionErrorMessage({
      magicDnsName: "desktop.tail.ts.net",
    });

    expect(message).toMatch(/desktop\.tail\.ts\.net/u);
    expect(message).toMatch(/NordVPN/u);
    expect(message).toMatch(/~tail\.ts\.net/u);
  });

  it("accepts MagicDNS names that resolve through system DNS", async () => {
    let lookupHostname: string | null = null;

    await probeTailscaleMagicDnsResolution({
      magicDnsName: "desktop.tail.ts.net",
      timeoutMs: 50,
      lookup: async (hostname) => {
        lookupHostname = hostname;
        return { address: "100.90.1.2", family: 4 };
      },
    });

    expect(lookupHostname).toBe("desktop.tail.ts.net");
  });

  it("rejects MagicDNS names that do not resolve through system DNS", async () => {
    await expect(
      probeTailscaleMagicDnsResolution({
        magicDnsName: "desktop.tail.ts.net",
        timeoutMs: 50,
        lookup: async () => {
          throw Object.assign(new Error("getaddrinfo ENOTFOUND desktop.tail.ts.net"), {
            code: "ENOTFOUND",
          });
        },
      }),
    ).rejects.toMatchObject({
      _tag: "TailscaleMagicDnsResolutionError",
      magicDnsName: "desktop.tail.ts.net",
    });

    await expect(
      probeTailscaleMagicDnsResolution({
        magicDnsName: "desktop.tail.ts.net",
        timeoutMs: 50,
        lookup: async () => {
          throw new Error("getaddrinfo ENOTFOUND desktop.tail.ts.net");
        },
      }),
    ).rejects.toBeInstanceOf(TailscaleMagicDnsResolutionError);
  });
});
