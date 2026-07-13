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
