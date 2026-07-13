import type { OnTheGoSettings } from "@t3tools/contracts";

export type OnTheGoVoiceCapability = "transcription" | "speech";
export interface OnTheGoVoiceModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
}

const identity = (model: OnTheGoVoiceModelIdentity) => `${model.providerId}/${model.modelId}`;

/** Selects only the configured primary or an explicitly approved fallback, in order. */
export const resolveSupportedVoiceModel = (input: {
  readonly settings: OnTheGoSettings;
  readonly capability: OnTheGoVoiceCapability;
  readonly supported: ReadonlyArray<OnTheGoVoiceModelIdentity>;
}) => {
  const primary =
    input.capability === "transcription"
      ? input.settings.transcriptionModel
      : input.settings.speechModel;
  const candidates = [primary, ...input.settings.fallbackModels[input.capability]];
  const supported = new Set(input.supported.map(identity));
  const selected = candidates.find((candidate) => supported.has(identity(candidate))) ?? null;
  return {
    selected,
    fallback: selected !== null && identity(selected) !== identity(primary),
    reason:
      selected === null
        ? `${input.capability === "transcription" ? "Transcription" : "Speech"} model ${identity(primary)} is not available on this device and no approved fallback is supported`
        : null,
  };
};
