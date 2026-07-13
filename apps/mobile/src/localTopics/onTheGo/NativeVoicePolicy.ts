import type { OnTheGoSettings } from "@t3tools/contracts";
import type { ExpoSpeechRecognitionOptions } from "expo-speech-recognition";

export const resolveNativeSpeechSelection = (settings: OnTheGoSettings) => {
  const transcriptionSupported =
    settings.transcriptionModel.providerId === "system" &&
    ["default-transcription", "on-device-transcription"].includes(
      settings.transcriptionModel.modelId,
    );
  const speechSupported =
    settings.speechModel.providerId === "system" &&
    settings.speechModel.modelId === "default-speech";
  const reason = !transcriptionSupported
    ? `Transcription model ${settings.transcriptionModel.providerId}/${settings.transcriptionModel.modelId} is not available on this device`
    : !speechSupported
      ? `Speech model ${settings.speechModel.providerId}/${settings.speechModel.modelId} is not available on this device`
      : null;
  return { transcriptionSupported, speechSupported, reason };
};

export const makeNativeRecognitionOptions = (
  settings: OnTheGoSettings,
  language: string,
): ExpoSpeechRecognitionOptions => ({
  lang: language,
  continuous: true,
  interimResults: false,
  addsPunctuation: true,
  contextualStrings: [
    ...settings.wakePhrases,
    "Stop",
    "Cancel",
    "Confirm",
    "Send it",
    "Back to commands",
  ],
  requiresOnDeviceRecognition: settings.transcriptionModel.modelId === "on-device-transcription",
  androidIntent: "android.speech.action.VOICE_SEARCH_HANDS_FREE",
  androidIntentOptions: {
    // The server still enforces ownership and exact authorization. Marking the
    // request secure additionally asks the platform recognizer to constrain
    // what it will do when a headset activates recognition on a locked device.
    EXTRA_SECURE: true,
    EXTRA_PREFER_OFFLINE: settings.transcriptionModel.modelId === "on-device-transcription",
  },
  iosCategory: {
    category: "playAndRecord",
    categoryOptions: ["allowBluetooth", "allowBluetoothA2DP", "defaultToSpeaker"],
    mode: "voiceChat",
  },
  iosVoiceProcessingEnabled: true,
});

export const shouldAcceptNativeTranscript = (input: {
  readonly transcript: string;
  readonly speaking: boolean;
  readonly bargeInEnabled: boolean;
  readonly pushToTalkArmed: boolean;
}) =>
  !input.speaking ||
  input.bargeInEnabled ||
  input.pushToTalkArmed ||
  input.transcript.trim().toLocaleLowerCase() === "stop";

export interface NativeVoicePolicyState {
  readonly enabled: boolean;
  readonly appState: "foreground" | "background" | "locked" | "terminated";
  readonly audioFocus: "available" | "call" | "media" | "navigation";
  readonly microphonePermission: "granted" | "denied" | "revoked";
  readonly ownerDeviceId: string | null;
  readonly localDeviceId: string;
  readonly continueRequired: boolean;
  readonly route: "speaker" | "receiver" | "wired-headset" | "bluetooth";
  readonly outputPrivacy: "private" | "public";
}

export interface NativeVoicePolicyDecision {
  readonly listen: boolean;
  readonly speak: boolean;
  readonly tones: boolean;
  readonly requireContinue: boolean;
  readonly speechDetail: "none" | "summary" | "detail";
  readonly reason: string | null;
}

export const decideNativeVoicePolicy = (
  state: NativeVoicePolicyState,
): NativeVoicePolicyDecision => {
  if (!state.enabled || state.appState === "terminated") {
    return {
      listen: false,
      speak: false,
      tones: false,
      requireContinue: false,
      speechDetail: "none",
      reason: "disabled",
    };
  }
  if (state.microphonePermission !== "granted") {
    return {
      listen: false,
      speak: false,
      tones: false,
      requireContinue: false,
      speechDetail: "none",
      reason: "microphone-permission",
    };
  }
  if (state.ownerDeviceId !== state.localDeviceId || state.continueRequired) {
    return {
      listen: false,
      speak: false,
      tones: false,
      requireContinue: true,
      speechDetail: "none",
      reason: "voice-ownership",
    };
  }
  if (state.audioFocus === "call") {
    return {
      listen: false,
      speak: false,
      tones: false,
      requireContinue: false,
      speechDetail: "none",
      reason: "call-active",
    };
  }
  const interrupted = state.audioFocus === "navigation";
  return {
    listen: true,
    speak: !interrupted,
    tones: !interrupted,
    requireContinue: false,
    speechDetail:
      state.outputPrivacy === "public" || state.route === "speaker" || state.route === "receiver"
        ? "summary"
        : "detail",
    reason: interrupted ? "navigation-active" : null,
  };
};
