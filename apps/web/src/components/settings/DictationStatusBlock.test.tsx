// @vitest-environment happy-dom
import type { DictationCapability } from "@t3tools/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DictationStatusBlock } from "./DictationStatusBlock";

afterEach(() => {
  cleanup();
});

const WHISPER_INSTALL_URL = "https://github.com/ggerganov/whisper.cpp";

describe("DictationStatusBlock", () => {
  it("renders the available state with model label and binary path", () => {
    const capability: DictationCapability = {
      available: true,
      reason: null,
      modelLabel: "ggml-base.en",
      modelPath: "/opt/whisper/models/ggml-base.en.bin",
      binaryPath: "/usr/bin/whisper-cli",
    };

    render(<DictationStatusBlock capability={capability} />);

    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("ggml-base.en")).toBeTruthy();
    expect(screen.getByText("/usr/bin/whisper-cli")).toBeTruthy();
    // The unavailable-only install link must not appear in the available state.
    expect(screen.queryByRole("link", { name: /whisper\.cpp install/i })).toBeNull();
  });

  it("renders the unavailable state with the reason and an install link", () => {
    const capability: DictationCapability = {
      available: false,
      reason: "whisper-cli binary not found on PATH",
      modelLabel: null,
      modelPath: null,
      binaryPath: null,
    };

    render(<DictationStatusBlock capability={capability} />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("whisper-cli binary not found on PATH")).toBeTruthy();

    const link = screen.getByRole("link", { name: /whisper\.cpp install/i });
    expect(link.getAttribute("href")).toBe(WHISPER_INSTALL_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("renders the unavailable state when the capability is null (pre-snapshot)", () => {
    render(<DictationStatusBlock capability={null} />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: /whisper\.cpp install/i })).toBeTruthy();
  });
});
