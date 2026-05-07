import type { DictationCapability as ServerDictationCapability } from "@t3tools/contracts";

export type ResolvedDictationCapability =
  | { available: true; reason: null; modelLabel: string }
  | { available: false; reason: string };

export interface ResolveCapabilityInput {
  server: ServerDictationCapability;
  isSecureContext: boolean;
  hasMediaDevices: boolean;
}

export function resolveDictationCapability(
  input: ResolveCapabilityInput,
): ResolvedDictationCapability {
  if (!input.server.available) {
    return { available: false, reason: input.server.reason ?? "Dictation unavailable on server." };
  }
  if (!input.isSecureContext) {
    return {
      available: false,
      reason:
        "Dictation requires a secure context (HTTPS). Try `tailscale serve` to expose the dev server over HTTPS.",
    };
  }
  if (!input.hasMediaDevices) {
    return {
      available: false,
      reason: "Browser does not expose mediaDevices.getUserMedia.",
    };
  }
  return {
    available: true,
    reason: null,
    modelLabel: input.server.modelLabel ?? "whisper.cpp",
  };
}
