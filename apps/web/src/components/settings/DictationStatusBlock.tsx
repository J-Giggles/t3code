import type { DictationCapability } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export interface DictationStatusBlockProps {
  readonly capability: DictationCapability | null;
  /**
   * When supplied, renders a "Rescan" button that re-probes the server's
   * whisper.cpp capability without restarting the WS connection. The
   * resolved capability replaces the prop locally so users see the new
   * status immediately. Optional so existing tests that exercise the
   * read-only render path keep passing.
   */
  readonly onRescan?: () => Promise<DictationCapability>;
}

const WHISPER_INSTALL_URL = "https://github.com/ggerganov/whisper.cpp";

/**
 * Read-only status block for the in-process dictation runner. Renders
 * the capability flag the server reports at boot (no in-app model
 * download in v1; users install whisper.cpp themselves). When `onRescan`
 * is provided, also renders a button that re-probes the server.
 */
export function DictationStatusBlock({ capability, onRescan }: DictationStatusBlockProps) {
  const [isRescanning, setIsRescanning] = useState(false);
  const [localCapability, setLocalCapability] = useState<DictationCapability | null>(null);

  const effectiveCapability = localCapability ?? capability;

  const handleRescan = async () => {
    if (!onRescan) return;
    setIsRescanning(true);
    try {
      const fresh = await onRescan();
      setLocalCapability(fresh);
    } catch (err) {
      console.error("[dictation] rescan failed:", err);
    } finally {
      setIsRescanning(false);
    }
  };

  const rescanControl = onRescan ? (
    <Button size="xs" variant="outline" disabled={isRescanning} onClick={() => void handleRescan()}>
      {isRescanning ? "Rescanning…" : "Rescan"}
    </Button>
  ) : undefined;

  if (effectiveCapability === null || !effectiveCapability.available) {
    return (
      <SettingsSection title="Dictation">
        <SettingsRow
          title="Status"
          description="Microphone-to-text uses a local whisper.cpp binary."
          control={rescanControl}
          status={
            <>
              <span className="block font-medium text-foreground">Unavailable</span>
              {effectiveCapability?.reason ? (
                <span className="mt-1 block break-words text-muted-foreground/80">
                  {effectiveCapability.reason}
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
        control={rescanControl}
        status={<span className="block font-medium text-foreground">Available</span>}
      />
      <SettingsRow
        title="Model"
        description="Whisper model file used for transcription."
        status={
          <span className="block break-all font-mono text-[11px] text-foreground">
            {effectiveCapability.modelLabel ?? "—"}
          </span>
        }
      />
      <SettingsRow
        title="Binary"
        description="Path to the whisper-cli executable that runs each session."
        status={
          <span className="block break-all font-mono text-[11px] text-foreground">
            {effectiveCapability.binaryPath ?? "—"}
          </span>
        }
      />
    </SettingsSection>
  );
}
