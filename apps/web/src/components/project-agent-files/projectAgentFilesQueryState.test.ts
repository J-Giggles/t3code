import type { EnvironmentApi, ProjectAgentFilesListResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  __resetEnvironmentApiOverridesForTests,
  __setEnvironmentApiOverrideForTests,
} from "~/environmentApi";

import {
  getProjectAgentFileReadQueryAtom,
  getProjectAgentFilesListQueryAtom,
} from "./projectAgentFilesQueryState";

const environmentId = EnvironmentId.make("environment-agent-files-query-test");

describe("project agent files queries", () => {
  afterEach(() => {
    __resetEnvironmentApiOverridesForTests();
    vi.unstubAllGlobals();
  });

  it("loads agent file lists and file previews through project RPC", async () => {
    vi.stubGlobal("window", {});
    const listResult = {
      cwd: "/repo",
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
        },
      ],
      secretStatuses: [],
      warnings: [],
    } satisfies ProjectAgentFilesListResult;
    const readResult = {
      file: listResult.files[0]!,
      contents: "# Agents\n",
      byteLength: 9,
      truncated: false,
    };
    const listAgentFiles = vi
      .fn<EnvironmentApi["projects"]["listAgentFiles"]>()
      .mockResolvedValue(listResult);
    const readAgentFile = vi
      .fn<EnvironmentApi["projects"]["readAgentFile"]>()
      .mockResolvedValue(readResult);
    __setEnvironmentApiOverrideForTests(environmentId, {
      projects: { listAgentFiles, readAgentFile },
    } as unknown as EnvironmentApi);

    const registry = AtomRegistry.make();
    const listAtom = getProjectAgentFilesListQueryAtom(environmentId, "/repo");
    const readAtom = getProjectAgentFileReadQueryAtom(environmentId, "/repo", "AGENTS.md");

    registry.get(listAtom);
    registry.get(readAtom);

    await vi.waitFor(() => {
      expect(Option.getOrNull(AsyncResult.value(registry.get(listAtom)))).toEqual(listResult);
      expect(Option.getOrNull(AsyncResult.value(registry.get(readAtom)))).toEqual(readResult);
    });
    expect(listAgentFiles).toHaveBeenCalledWith({ cwd: "/repo" });
    expect(readAgentFile).toHaveBeenCalledWith({ cwd: "/repo", relativePath: "AGENTS.md" });
    registry.dispose();
  });
});
