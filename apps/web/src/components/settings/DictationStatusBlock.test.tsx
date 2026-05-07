// @vitest-environment happy-dom
import type { DictationCapability } from "@t3tools/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("renders a Rescan button and invokes onRescan when clicked", async () => {
    const onRescan = vi.fn<() => Promise<DictationCapability>>().mockResolvedValue({
      available: true,
      reason: null,
      modelLabel: "ggml-base.en",
      modelPath: "/m",
      binaryPath: "/usr/bin/whisper-cli",
    });

    render(<DictationStatusBlock capability={null} onRescan={onRescan} />);

    const button = screen.getByRole("button", { name: /rescan/i });
    expect(button).toBeTruthy();
    fireEvent.click(button);

    await waitFor(() => {
      expect(onRescan).toHaveBeenCalledTimes(1);
    });
  });

  it("updates the displayed capability after a successful rescan", async () => {
    const fresh: DictationCapability = {
      available: true,
      reason: null,
      modelLabel: "ggml-medium.en",
      modelPath: "/opt/whisper/models/ggml-medium.en.bin",
      binaryPath: "/opt/whisper/bin/whisper-cli",
    };
    let resolveRescan: (capability: DictationCapability) => void = () => undefined;
    const onRescan = vi.fn<() => Promise<DictationCapability>>().mockImplementation(
      () =>
        new Promise<DictationCapability>((resolve) => {
          resolveRescan = resolve;
        }),
    );

    const initialCapability: DictationCapability = {
      available: false,
      reason: "whisper-cli not on PATH",
      modelLabel: null,
      modelPath: null,
      binaryPath: null,
    };

    render(<DictationStatusBlock capability={initialCapability} onRescan={onRescan} />);

    expect(screen.getByText("Unavailable")).toBeTruthy();

    const button = screen.getByRole("button", { name: /rescan/i });
    fireEvent.click(button);

    // While in-flight, the button shows the loading label.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /rescanning/i })).toBeTruthy();
    });

    await act(async () => {
      resolveRescan(fresh);
    });

    await waitFor(() => {
      expect(screen.getByText("Available")).toBeTruthy();
    });
    expect(screen.getByText("ggml-medium.en")).toBeTruthy();
    expect(screen.getByText("/opt/whisper/bin/whisper-cli")).toBeTruthy();
  });
});
