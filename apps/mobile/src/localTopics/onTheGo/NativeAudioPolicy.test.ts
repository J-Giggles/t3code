import { describe, expect, it } from "vite-plus/test";

import { normalizeNativeAudioPolicy } from "./NativeAudioPolicyState";

describe("On-the-Go native audio policy bridge", () => {
  it("OTG-UT-020/021: normalizes physical route, interruption, and low-power state", () => {
    expect(
      normalizeNativeAudioPolicy({
        route: "bluetooth",
        audioFocus: "call",
        lowPowerMode: true,
      }),
    ).toEqual({ route: "bluetooth", audioFocus: "call", lowPowerMode: true });
    expect(normalizeNativeAudioPolicy({ route: "invented" })).toEqual({
      route: "unknown",
      audioFocus: "available",
      lowPowerMode: false,
    });
  });
});
