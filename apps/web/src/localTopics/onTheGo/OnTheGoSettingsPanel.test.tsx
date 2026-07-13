import { DEFAULT_ON_THE_GO_SETTINGS } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ON_THE_GO_TRANSCRIPTION_OPTIONS, OnTheGoSettingsPanelView } from "./OnTheGoSettingsPanel";

describe("On-the-Go settings", () => {
  it("OTG-UT-019/021: exposes independent models, approved fallbacks, budgets, privacy, wake, and Barge-In controls", () => {
    const markup = renderToStaticMarkup(
      <OnTheGoSettingsPanelView settings={DEFAULT_ON_THE_GO_SETTINGS} update={vi.fn()} />,
    );
    expect(markup).toContain('data-testid="on-the-go-settings"');
    expect(markup).toContain('aria-label="Enable On-the-Go Mode"');
    expect(markup).toContain('aria-label="Enable On-the-Go Barge-In"');
    expect(markup).toContain('aria-label="On-the-Go output privacy"');
    expect(markup).toContain('aria-label="Transcription model selection"');
    expect(markup).toContain('aria-label="Theo model provider"');
    expect(markup).toContain('aria-label="Speech model selection"');
    expect(markup).toContain('aria-label="Approved Theo fallback models"');
    expect(markup).toContain('aria-label="Theo budget warning calls"');
    expect(markup).toContain('aria-label="Theo budget hard limit calls"');
    expect(ON_THE_GO_TRANSCRIPTION_OPTIONS).toContainEqual(
      expect.objectContaining({ modelId: "on-device-transcription" }),
    );
    expect(markup).toContain("T3, Hey Theo");
  });
});
