import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  resolveServerBackedAppDisplayName,
  resolveServerBackedAppStageLabel,
} from "./branding.logic";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  globalThis.window = originalWindow;
});

describe("branding", () => {
  it("uses injected desktop branding when available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          getAppBranding: () => ({
            baseName: "T3 Code",
            stageLabel: "Nightly",
            displayName: "T3 Code (Nightly)",
          }),
        },
      },
    });

    const branding = await import("./branding");

    expect(branding.APP_BASE_NAME).toBe("T3 Code");
    expect(branding.APP_STAGE_LABEL).toBe("Nightly");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Nightly)");
  });

  it("shows dev worktree metadata ahead of generic desktop dev branding", async () => {
    vi.stubEnv("VITE_DEV_WORKTREE_NAME", "staging");
    vi.stubEnv("VITE_DEV_BRANCH_NAME", "staging");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          getAppBranding: () => ({
            baseName: "T3 Code",
            stageLabel: "Dev",
            displayName: "T3 Code (Dev)",
          }),
        },
      },
    });

    const branding = await import("./branding");

    expect(branding.DEV_APP_STAGE_LABEL).toBe("staging / staging");
    expect(branding.APP_STAGE_LABEL).toBe("staging / staging");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (staging / staging)");
  });

  it("normalizes hosted app channel metadata", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "nightly");

    const branding = await import("./branding");

    expect(branding.HOSTED_APP_CHANNEL).toBe("nightly");
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBe("Nightly");
    expect(branding.APP_STAGE_LABEL).toBe("Nightly");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Nightly)");
  });

  it("uses dev worktree and branch metadata when available", async () => {
    vi.stubEnv("VITE_DEV_WORKTREE_NAME", "staging");
    vi.stubEnv("VITE_DEV_BRANCH_NAME", "feature/pairing-label");

    const branding = await import("./branding");

    expect(branding.DEV_APP_STAGE_LABEL).toBe("staging / feature/pairing-label");
    expect(branding.APP_STAGE_LABEL).toBe("staging / feature/pairing-label");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (staging / feature/pairing-label)");
  });

  it("uses launcher worktree and branch metadata when available", async () => {
    vi.stubEnv("VITE_T3_WORKTREE_PATH", "/repo/t3code/.worktrees/staging");
    vi.stubEnv("VITE_T3_WORKTREE_ROLE", "staging");
    vi.stubEnv("VITE_T3_GIT_BRANCH", "staging");

    const branding = await import("./branding");

    expect(branding.DEV_APP_STAGE_LABEL).toBe("staging / staging");
    expect(branding.APP_STAGE_LABEL).toBe("staging / staging");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (staging / staging)");
  });

  it("falls back to the static dev label when dev checkout metadata is unavailable", async () => {
    const branding = await import("./branding");

    expect(branding.DEV_APP_STAGE_LABEL).toBeNull();
    expect(branding.APP_STAGE_LABEL).toBe("Dev");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Dev)");
  });

  it("ignores unknown hosted app channels", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "preview");

    const branding = await import("./branding");

    expect(branding.HOSTED_APP_CHANNEL).toBeNull();
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBeNull();
  });
});

describe("branding logic", () => {
  it("returns Nightly for nightly primary server versions", () => {
    expect(
      resolveServerBackedAppStageLabel({
        primaryServerVersion: "0.0.28-nightly.20260616.12",
        fallbackStageLabel: "Alpha",
      }),
    ).toBe("Nightly");
  });

  it("updates the display name for nightly primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "T3 Code",
        fallbackDisplayName: "T3 Code (Alpha)",
        fallbackStageLabel: "Alpha",
        primaryServerVersion: "0.0.28-nightly.20260616.12",
      }),
    ).toBe("T3 Code (Nightly)");
  });

  it("keeps the fallback display name for stable primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "T3 Code",
        fallbackDisplayName: "T3 Code (Alpha)",
        fallbackStageLabel: "Alpha",
        primaryServerVersion: "0.0.27",
      }),
    ).toBe("T3 Code (Alpha)");
  });

  it("keeps the fallback display name for malformed nightly primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "T3 Code",
        fallbackDisplayName: "T3 Code (Alpha)",
        fallbackStageLabel: "Alpha",
        primaryServerVersion: "0.0.28-nightly.20260616",
      }),
    ).toBe("T3 Code (Alpha)");
  });
});
