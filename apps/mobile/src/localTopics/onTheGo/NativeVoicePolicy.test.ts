import { describe, expect, it } from "vite-plus/test";

import { decideNativeVoicePolicy, type NativeVoicePolicyState } from "./NativeVoicePolicy";

const base = (): NativeVoicePolicyState => ({
  enabled: true,
  appState: "foreground",
  audioFocus: "available",
  microphonePermission: "granted",
  ownerDeviceId: "phone",
  localDeviceId: "phone",
  continueRequired: false,
  route: "bluetooth",
  outputPrivacy: "private",
});

describe("On-the-Go native voice policy", () => {
  it("OTG-UT-002/021: retains one owner while backgrounded and locked", () => {
    expect(decideNativeVoicePolicy({ ...base(), appState: "background" })).toMatchObject({
      listen: true,
      speak: true,
    });
    expect(decideNativeVoicePolicy({ ...base(), appState: "locked" })).toMatchObject({
      listen: true,
      speak: true,
    });
    expect(decideNativeVoicePolicy({ ...base(), ownerDeviceId: "tablet" })).toMatchObject({
      listen: false,
      requireContinue: true,
    });
  });

  it("OTG-UT-020: calls suppress listening, speech, and tones while navigation pauses output", () => {
    expect(decideNativeVoicePolicy({ ...base(), audioFocus: "call" })).toMatchObject({
      listen: false,
      speak: false,
      tones: false,
      reason: "call-active",
    });
    expect(decideNativeVoicePolicy({ ...base(), audioFocus: "navigation" })).toMatchObject({
      listen: true,
      speak: false,
      tones: false,
    });
  });

  it("OTG-UT-020/021: public routes summarize and revoked permission or termination fail closed", () => {
    expect(decideNativeVoicePolicy({ ...base(), route: "speaker" }).speechDetail).toBe("summary");
    expect(decideNativeVoicePolicy({ ...base(), outputPrivacy: "public" }).speechDetail).toBe(
      "summary",
    );
    expect(decideNativeVoicePolicy({ ...base(), microphonePermission: "revoked" })).toMatchObject({
      listen: false,
      speak: false,
    });
    expect(decideNativeVoicePolicy({ ...base(), appState: "terminated" })).toMatchObject({
      listen: false,
      speak: false,
    });
  });
});
