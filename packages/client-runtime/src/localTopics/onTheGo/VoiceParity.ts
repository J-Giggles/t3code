export interface OnTheGoVoiceParityEntry {
  readonly feature: string;
  readonly phrases: ReadonlyArray<string>;
  readonly reciprocalControl: "dedicated-control" | "voice-dock-command-field";
  readonly captioned: true;
}

/**
 * Audit catalog for every command family implemented by the shared
 * controller. Web and native both expose the same command field, while the
 * highest-frequency safety actions also have dedicated controls.
 */
export const ON_THE_GO_VOICE_PARITY_CATALOG: ReadonlyArray<OnTheGoVoiceParityEntry> = [
  {
    feature: "mode-toggle",
    phrases: ["Turn off On-the-Go Mode"],
    reciprocalControl: "dedicated-control",
    captioned: true,
  },
  {
    feature: "universal-stop",
    phrases: ["Stop"],
    reciprocalControl: "dedicated-control",
    captioned: true,
  },
  {
    feature: "cancel",
    phrases: ["Cancel"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "exact-confirmation",
    phrases: ["Confirm"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "prepared-prompt-send",
    phrases: ["Send it"],
    reciprocalControl: "dedicated-control",
    captioned: true,
  },
  {
    feature: "announcement-navigation",
    phrases: [
      "T3 what was the last announcement",
      "Next response",
      "Previous response",
      "What needs me",
    ],
    reciprocalControl: "dedicated-control",
    captioned: true,
  },
  {
    feature: "theo-conversation",
    phrases: ["Hey Theo", "Back to commands"],
    reciprocalControl: "dedicated-control",
    captioned: true,
  },
  {
    feature: "dictation",
    phrases: [
      "Start dictation",
      "Finish dictation",
      "Cancel dictation",
      "Replace dictation with …",
    ],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "follow-mode",
    phrases: [
      "Follow this chat",
      "Switch follow to this chat",
      "Stop following",
      "What changed in the followed chat",
    ],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "steering",
    phrases: ["Steer", "No, steer the running agent"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "new-agent-handoff",
    phrases: ["Send this to a new agent with the context needed on this project"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "profile-learning",
    phrases: ["Remember that I prefer …", "Undo Theo preference", "Forget my Theo preferences"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "command-vocabulary",
    phrases: ["Map command … to …"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "ownership-recovery",
    phrases: ["Continue"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
  {
    feature: "data-controls",
    phrases: ["Inspect Theo data", "Preview Theo export", "Show On-the-Go diagnostics"],
    reciprocalControl: "voice-dock-command-field",
    captioned: true,
  },
] as const;

export const ON_THE_GO_IMMUTABLE_PHRASES = ["Stop", "Cancel", "Confirm", "Send it"] as const;
