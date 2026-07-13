import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { VoiceDockView } from "./VoiceDock.tsx";

describe("On-the-Go Voice Dock", () => {
  it("OTG-UT-006/021: renders reciprocal controls, captions, transcript, and numbered badges", () => {
    const markup = renderToStaticMarkup(
      <VoiceDockView
        expanded
        state={{
          enabled: true,
          available: true,
          availabilityReason: null,
          backgroundAvailable: true,
          mode: "theo-conversation",
          caption: "Theo is ready",
          transcript: "What changed?",
          responseBadge: 3,
          attentionBadge: 1,
          queuedWork: 2,
          ownerDeviceId: "desktop-device",
          continueRequired: false,
          theoMessages: [{ role: "theo", text: "The focused tests passed." }],
          theoPreferences: ["voice: concise summaries"],
          preparedPrompt: {
            revisionId: "revision-1",
            content: "Run the complete suite.",
            targetChatId: "chat-1",
            targetAgentId: "agent-1",
            intent: "queue",
          },
          vocabulary: [{ phrase: "halt voice", action: "speech.stop" }],
          followTimeline: [],
        }}
        onExpandedChange={() => undefined}
        onToggle={() => undefined}
        onPhrase={() => undefined}
      />,
    );
    expect(markup).toContain('data-testid="on-the-go-voice-dock"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-label="3 response notifications"');
    expect(markup).toContain('aria-label="1 attention notification"');
    expect(markup).toContain("What changed?");
    expect(markup).toContain("The focused tests passed.");
    expect(markup).toContain("voice: concise summaries");
    expect(markup).toContain("Prepared Prompt");
    expect(markup).toContain("Run the complete suite.");
    expect(markup).toContain("revision-1");
    expect(markup).toContain("halt voice");
    expect(markup).toContain("Stop");
    expect(markup).toContain("Send it");
    expect(markup).toContain("Last announcement");
  });
});
