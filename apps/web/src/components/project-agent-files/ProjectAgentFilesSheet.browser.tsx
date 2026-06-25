import "../../index.css";

import type { EnvironmentApi, LocalApi, ProjectAgentFilesListResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { page } from "vite-plus/test/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import {
  __resetEnvironmentApiOverridesForTests,
  __setEnvironmentApiOverrideForTests,
} from "~/environmentApi";
import { __resetLocalApiForTests } from "~/localApi";
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "~/rpc/atomRegistry";

import { ProjectAgentFilesSheet } from "./ProjectAgentFilesSheet";

const environmentId = EnvironmentId.make("environment-agent-files-sheet-browser-test");

function createListResult(): ProjectAgentFilesListResult {
  return {
    cwd: "/repo/project",
    files: [
      {
        relativePath: "AGENTS.md",
        providers: ["codex", "opencode"],
        kind: "instructions",
        status: "present",
        autoLoaded: true,
        recommended: true,
        editable: true,
        deletable: false,
        description: "Canonical instructions",
        byteLength: 9,
        updatedAt: "2026-06-23T12:00:00.000Z",
      },
      {
        relativePath: "CLAUDE.md",
        providers: ["claude"],
        kind: "instructions",
        status: "missing",
        autoLoaded: true,
        recommended: true,
        editable: true,
        deletable: true,
        description: "Claude instructions",
        templateId: "claude-shim",
      },
      {
        relativePath: ".agents/memory/project-facts.md",
        providers: ["t3"],
        kind: "memory",
        status: "present",
        autoLoaded: false,
        recommended: true,
        editable: true,
        deletable: true,
        description: "Project memory",
        byteLength: 16,
      },
    ],
    manifest: {
      version: 1,
      canonicalInstructions: "AGENTS.md",
      mcpServers: [],
      memory: {
        projectFacts: ".agents/memory/project-facts.md",
        knownDecisions: ".agents/memory/known-decisions.md",
        recurringIssues: ".agents/memory/recurring-issues.md",
      },
      validation: {
        requiredCommands: ["vp check"],
      },
      toolAuth: {
        vercel: {
          env: {
            VERCEL_TOKEN: { secretRef: "VERCEL_TOKEN" },
          },
          args: [],
        },
      },
    },
    secretStatuses: [
      {
        secretRef: "VERCEL_TOKEN",
        configured: true,
        projectKey: "path-test",
        mcpServerIds: [],
        toolIds: ["vercel"],
      },
    ],
    warnings: [],
  };
}

describe("ProjectAgentFilesSheet", () => {
  let mounted: Awaited<ReturnType<typeof render>> | null = null;

  beforeEach(async () => {
    resetAppAtomRegistryForTests();
    __resetEnvironmentApiOverridesForTests();
    await __resetLocalApiForTests();
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    await mounted?.unmount();
    mounted = null;
    Reflect.deleteProperty(window, "nativeApi");
    __resetEnvironmentApiOverridesForTests();
    resetAppAtomRegistryForTests();
    await __resetLocalApiForTests();
    document.body.innerHTML = "";
  });

  it("renders files, creates missing templates, scaffolds harness files, and stores secrets without showing values", async () => {
    const listResult = createListResult();
    const listAgentFiles = vi
      .fn<EnvironmentApi["projects"]["listAgentFiles"]>()
      .mockResolvedValue(listResult);
    const readAgentFile = vi.fn<EnvironmentApi["projects"]["readAgentFile"]>().mockResolvedValue({
      file: listResult.files[0]!,
      contents: "# Agents\n",
      byteLength: 9,
      truncated: false,
    });
    const writeAgentFile = vi.fn<EnvironmentApi["projects"]["writeAgentFile"]>().mockResolvedValue({
      file: {
        ...listResult.files[1]!,
        status: "present",
        byteLength: 78,
      },
    });
    const scaffoldAgentHarness = vi
      .fn<EnvironmentApi["projects"]["scaffoldAgentHarness"]>()
      .mockResolvedValue({
        created: [".agents/harness.json"],
        skipped: [".agents/project.md"],
        files: listResult.files,
        warnings: [],
      });
    const writeAgentSecret = vi
      .fn<EnvironmentApi["projects"]["writeAgentSecret"]>()
      .mockResolvedValue({
        ...listResult.secretStatuses[0]!,
        configured: true,
      });
    __setEnvironmentApiOverrideForTests(environmentId, {
      projects: {
        listAgentFiles,
        readAgentFile,
        writeAgentFile,
        scaffoldAgentHarness,
        writeAgentSecret,
      },
    } as unknown as EnvironmentApi);
    window.nativeApi = {
      dialogs: {
        confirm: vi.fn().mockResolvedValue(true),
      },
      shell: {
        openInEditor: vi.fn(),
      },
    } as unknown as LocalApi;

    mounted = await render(
      <AppAtomRegistryProvider>
        <ProjectAgentFilesSheet
          environmentId={environmentId}
          projectName="Project"
          projectRoot="/repo/project"
          availableEditors={[]}
          trigger={<button type="button">Agent files</button>}
        />
      </AppAtomRegistryProvider>,
    );

    await page.getByRole("button", { name: "Agent files" }).click();
    await expect.element(page.getByRole("heading", { name: "Agent Files" })).toBeVisible();
    await expect.element(page.getByText("AGENTS.md").first()).toBeVisible();
    await expect.element(page.getByText("CLAUDE.md").first()).toBeVisible();

    await page.getByRole("button", { name: "Scaffold" }).click();
    await vi.waitFor(() => {
      expect(scaffoldAgentHarness).toHaveBeenCalledWith({ cwd: "/repo/project" });
    });
    await expect.element(page.getByText("Created 1; skipped 1.")).toBeVisible();

    await page.getByText("CLAUDE.md").first().click();
    await page.getByRole("button", { name: "Create" }).click();
    await vi.waitFor(() => {
      expect(writeAgentFile).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/repo/project",
          relativePath: "CLAUDE.md",
          mode: "create",
        }),
      );
    });

    await page.getByRole("button", { name: "MCP/Auth" }).click();
    await expect.element(page.getByText("VERCEL_TOKEN")).toBeVisible();
    expect(document.body.textContent).not.toContain("already-stored-secret");
    await page.getByPlaceholder("Secret value").fill("new-secret");
    await page.getByRole("button", { name: "Save" }).click();
    await vi.waitFor(() => {
      expect(writeAgentSecret).toHaveBeenCalledWith({
        cwd: "/repo/project",
        secretRef: "VERCEL_TOKEN",
        value: "new-secret",
      });
    });
  });
});
