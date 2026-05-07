import type { DictationCapability } from "@t3tools/contracts";

import { SettingsRow, SettingsSection } from "./settingsLayout";

export interface DictationStatusBlockProps {
  readonly capability: DictationCapability | null;
}

const WHISPER_INSTALL_URL = "https://github.com/ggerganov/whisper.cpp";

/**
 * Read-only status block for the in-process dictation runner. Renders
 * the capability flag the server reports at boot (no in-app model
 * download in v1; users install whisper.cpp themselves).
 */
export function DictationStatusBlock({ capability }: DictationStatusBlockProps) {
  if (capability === null || !capability.available) {
    return (
      <SettingsSection title="Dictation">
        <SettingsRow
          title="Status"
          description="Microphone-to-text uses a local whisper.cpp binary."
          status={
            <>
              <span className="block font-medium text-foreground">Unavailable</span>
              {capability?.reason ? (
                <span className="mt-1 block break-words text-muted-foreground/80">
                  {capability.reason}
                </span>
              ) : null}
              <span className="mt-1 block">
                <a
                  href={WHISPER_INSTALL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  whisper.cpp install instructions
                </a>
              </span>
            </>
          }
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Dictation">
      <SettingsRow
        title="Status"
        description="Microphone-to-text uses a local whisper.cpp binary."
        status={<span className="block font-medium text-foreground">Available</span>}
      />
      <SettingsRow
        title="Model"
        description="Whisper model file used for transcription."
        status={
          <span className="block break-all font-mono text-[11px] text-foreground">
            {capability.modelLabel ?? "—"}
          </span>
        }
      />
      <SettingsRow
        title="Binary"
        description="Path to the whisper-cli executable that runs each session."
        status={
          <span className="block break-all font-mono text-[11px] text-foreground">
            {capability.binaryPath ?? "—"}
          </span>
        }
      />
    </SettingsSection>
  );
}
