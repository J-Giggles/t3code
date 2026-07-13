import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_ON_THE_GO_SETTINGS } from "@t3tools/contracts";

import {
  decideNativeVoicePolicy,
  makeNativeRecognitionOptions,
  resolveNativeSpeechSelection,
  shouldAcceptNativeTranscript,
  type NativeVoicePolicyState,
} from "./NativeVoicePolicy";

const base = (): NativeVoicePolicyState => ({
  enabled: true,
  appState: "foreground",
  audioFocus: "available",
  microphonePermission: "granted",
  ownerDeviceId: "phone",
  localDeviceId: "phone",
  continueRequired: false,
  route: "bluetooth",
  lowPowerMode: false,
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
    expect(
      decideNativeVoicePolicy({ ...base(), route: "unknown", outputPrivacy: "private" })
        .speechDetail,
    ).toBe("summary");
    expect(
      decideNativeVoicePolicy({ ...base(), lowPowerMode: true, appState: "background" }),
    ).toMatchObject({ listen: false, speak: false, reason: "low-power-background" });
  });

  it("OTG-UT-019/021: allows the native on-device recognizer and rejects unsupported providers", () => {
    expect(
      resolveNativeSpeechSelection({
        ...DEFAULT_ON_THE_GO_SETTINGS,
        transcriptionModel: {
          providerId: "system",
          modelId: "on-device-transcription",
          capability: "transcription",
        },
      }),
    ).toMatchObject({ transcriptionSupported: true, speechSupported: true, reason: null });
    expect(
      resolveNativeSpeechSelection({
        ...DEFAULT_ON_THE_GO_SETTINGS,
        speechModel: { providerId: "cloud", modelId: "tts", capability: "speech" },
      }).reason,
    ).toBe(
      "Speech model cloud/tts is not available on this device and no approved fallback is supported",
    );
  });

  it("OTG-UT-003/020/021: configures secure hands-free audio and push-to-talk bypasses noisy-place Barge-In policy once", () => {
    const options = makeNativeRecognitionOptions(
      {
        ...DEFAULT_ON_THE_GO_SETTINGS,
        transcriptionModel: {
          providerId: "system",
          modelId: "on-device-transcription",
          capability: "transcription",
        },
      },
      "en-GB",
    );
    expect(options).toMatchObject({
      continuous: true,
      requiresOnDeviceRecognition: true,
      androidIntent: "android.speech.action.VOICE_SEARCH_HANDS_FREE",
      androidIntentOptions: { EXTRA_SECURE: true, EXTRA_PREFER_OFFLINE: true },
      iosCategory: { category: "playAndRecord" },
    });
    expect(options.contextualStrings).toContain("Send it");
    expect(
      shouldAcceptNativeTranscript({
        transcript: "background conversation",
        speaking: true,
        bargeInEnabled: false,
        pushToTalkArmed: false,
      }),
    ).toBe(false);
    expect(
      shouldAcceptNativeTranscript({
        transcript: "next response",
        speaking: true,
        bargeInEnabled: false,
        pushToTalkArmed: true,
      }),
    ).toBe(true);
  });
});
