import "../../index.css";

import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  type LocalApi,
  type ServerConfig,
} from "@t3tools/contracts";
import { PROMPT_IDS, getPromptDefaultHash } from "@t3tools/shared/prompts";
import { page } from "vite-plus/test/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { __resetLocalApiForTests } from "../../localApi";
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../../rpc/atomRegistry";
import { resetServerStateForTests, setServerConfigSnapshot } from "../../rpc/serverState";
import { PromptSettingsPanel } from "./PromptSettingsPanel";

function createServerConfig(): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("environment-local"),
      label: "Local environment",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie", "bearer-access-token"],
      sessionCookieName: "t3_session",
    },
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.t3code-keybindings.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/repo/project/.t3/logs",
      localTracingEnabled: true,
      otlpTracesUrl: "",
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
      otlpLogsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
}

describe("PromptSettingsPanel", () => {
  let mounted:
    | (Awaited<ReturnType<typeof render>> & {
        cleanup?: () => Promise<void>;
        unmount?: () => Promise<void>;
      })
    | null = null;

  beforeEach(async () => {
    resetAppAtomRegistryForTests();
    resetServerStateForTests();
    await __resetLocalApiForTests();
    localStorage.clear();
  });

  afterEach(async () => {
    if (mounted) {
      const teardown = mounted.cleanup ?? mounted.unmount;
      await teardown?.call(mounted).catch(() => {});
    }
    mounted = null;
    Reflect.deleteProperty(window, "nativeApi");
    document.body.innerHTML = "";
    resetAppAtomRegistryForTests();
    resetServerStateForTests();
    await __resetLocalApiForTests();
  });

  it("renders defaults, saves custom prompts, and resets overrides", async () => {
    const updateSettings = vi.fn<LocalApi["server"]["updateSettings"]>().mockResolvedValue({
      ...DEFAULT_SERVER_SETTINGS,
      promptOverrides: {},
    });
    window.nativeApi = {
      persistence: {
        getClientSettings: vi.fn().mockResolvedValue(null),
        setClientSettings: vi.fn().mockResolvedValue(undefined),
      },
      server: {
        updateSettings,
      },
    } as unknown as LocalApi;
    setServerConfigSnapshot(createServerConfig());

    mounted = await render(
      <AppAtomRegistryProvider>
        <PromptSettingsPanel />
      </AppAtomRegistryProvider>,
    );

    await expect.element(page.getByRole("heading", { name: "Composer" })).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Review changes prompt"))
      .toHaveValue("Please review these changes for bugs, regressions, and missing tests.");

    await page.getByLabelText("Review changes prompt").fill("Review this patch carefully.");
    await page.getByRole("button", { name: "Save Review changes prompt" }).click();

    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        promptOverrides: {
          [PROMPT_IDS.composerReview]: {
            content: "Review this patch carefully.",
            defaultHash: getPromptDefaultHash(PROMPT_IDS.composerReview),
          },
        },
      });
    });

    await page.getByRole("button", { name: "Reset Review changes prompt" }).click();

    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenLastCalledWith({ promptOverrides: {} });
    });
  });
});
