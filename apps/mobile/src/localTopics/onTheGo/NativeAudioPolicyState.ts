export interface NativeAudioPolicySnapshot {
  readonly route: "speaker" | "receiver" | "wired-headset" | "bluetooth" | "unknown";
  readonly audioFocus: "available" | "call";
  readonly lowPowerMode: boolean;
}

export const fallbackNativeAudioPolicy: NativeAudioPolicySnapshot = {
  route: "unknown",
  audioFocus: "available",
  lowPowerMode: false,
};

export const normalizeNativeAudioPolicy = (value: unknown): NativeAudioPolicySnapshot => {
  if (typeof value !== "object" || value === null) return fallbackNativeAudioPolicy;
  const candidate = value as Record<string, unknown>;
  const route = ["speaker", "receiver", "wired-headset", "bluetooth", "unknown"].includes(
    String(candidate.route),
  )
    ? (candidate.route as NativeAudioPolicySnapshot["route"])
    : "unknown";
  return {
    route,
    audioFocus: candidate.audioFocus === "call" ? "call" : "available",
    lowPowerMode: candidate.lowPowerMode === true,
  };
};
