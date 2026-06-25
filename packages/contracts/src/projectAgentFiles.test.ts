import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ProjectAgentFileDescriptor,
  ProjectAgentFileReadInput,
  ProjectAgentFileWriteInput,
  ProjectAgentFilesListResult,
  ProjectAgentHarnessManifest,
  ProjectAgentHarnessScaffoldResult,
  ProjectAgentSecretDeleteInput,
  ProjectAgentSecretStatus,
  ProjectAgentSecretWriteInput,
} from "./project.ts";

const decodeDescriptor = Schema.decodeUnknownSync(ProjectAgentFileDescriptor);
const decodeHarnessManifest = Schema.decodeUnknownSync(ProjectAgentHarnessManifest);
const decodeListResult = Schema.decodeUnknownSync(ProjectAgentFilesListResult);
const decodeReadInput = Schema.decodeUnknownSync(ProjectAgentFileReadInput);
const decodeWriteInput = Schema.decodeUnknownSync(ProjectAgentFileWriteInput);
const decodeScaffoldResult = Schema.decodeUnknownSync(ProjectAgentHarnessScaffoldResult);
const decodeSecretWriteInput = Schema.decodeUnknownSync(ProjectAgentSecretWriteInput);
const decodeSecretDeleteInput = Schema.decodeUnknownSync(ProjectAgentSecretDeleteInput);
const decodeSecretStatus = Schema.decodeUnknownSync(ProjectAgentSecretStatus);

describe("project agent files contracts", () => {
  it("decodes file descriptors across providers and statuses", () => {
    expect(
      decodeDescriptor({
        relativePath: ".agents/harness.json",
        providers: ["t3"],
        kind: "harness-manifest",
        status: "present",
        autoLoaded: true,
        recommended: true,
        editable: true,
        deletable: true,
        description: "T3 Code harness manifest",
        templateId: "t3-harness-manifest",
        byteLength: 120,
        updatedAt: "2026-06-23T12:00:00.000Z",
      }),
    ).toMatchObject({
      providers: ["t3"],
      kind: "harness-manifest",
      status: "present",
    });

    expect(
      decodeDescriptor({
        relativePath: "CLAUDE.md",
        providers: ["claude"],
        kind: "instructions",
        status: "missing",
        autoLoaded: true,
        recommended: true,
        editable: true,
        deletable: true,
        description: "Claude instructions",
      }),
    ).toMatchObject({ status: "missing" });
  });

  it("decodes the harness manifest with defaults and secret refs", () => {
    const decoded = decodeHarnessManifest({
      version: 1,
      mcpServers: [
        {
          id: "jira-local",
          name: "jira-local",
          command: "node",
          env: {
            JIRA_TOKEN: { secretRef: "JIRA_TOKEN" },
            JIRA_HOST: "https://example.atlassian.net",
          },
        },
      ],
      toolAuth: {
        vercel: {
          env: {
            VERCEL_TOKEN: { secretRef: "VERCEL_TOKEN" },
          },
        },
      },
    });

    expect(decoded.canonicalInstructions).toBe("AGENTS.md");
    expect(decoded.mcpServers[0]).toMatchObject({
      enabled: true,
      args: [],
    });
    expect(decoded.validation.requiredCommands).toEqual([]);
    expect(decoded.toolAuth.vercel?.args).toEqual([]);
  });

  it("decodes list, scaffold, read/write, and secret payloads", () => {
    const file = decodeDescriptor({
      relativePath: "AGENTS.md",
      providers: ["codex", "opencode"],
      kind: "instructions",
      status: "present",
      autoLoaded: true,
      recommended: true,
      editable: true,
      deletable: false,
      description: "Canonical instructions",
    });
    const secretStatus = decodeSecretStatus({
      secretRef: "GITHUB_TOKEN",
      configured: false,
      projectKey: "path-abc123",
      mcpServerIds: ["github"],
      toolIds: ["gh"],
    });

    expect(
      decodeListResult({
        cwd: "/repo",
        files: [file],
        secretStatuses: [secretStatus],
        warnings: ["Invalid .agents/harness.json"],
      }),
    ).toMatchObject({ cwd: "/repo" });
    expect(
      decodeScaffoldResult({
        created: [".agents/harness.json"],
        skipped: [".agents/project.md"],
        files: [file],
        warnings: [],
      }),
    ).toMatchObject({ created: [".agents/harness.json"] });
    expect(decodeReadInput({ cwd: "/repo", relativePath: "AGENTS.md" })).toMatchObject({
      relativePath: "AGENTS.md",
    });
    expect(
      decodeWriteInput({
        cwd: "/repo",
        relativePath: "CLAUDE.md",
        contents: "# Claude\n",
        mode: "create",
      }),
    ).toMatchObject({ mode: "create" });
    expect(
      decodeSecretWriteInput({
        cwd: "/repo",
        secretRef: "VERCEL_TOKEN",
        value: "redacted",
      }),
    ).toMatchObject({ secretRef: "VERCEL_TOKEN" });
    expect(decodeSecretDeleteInput({ cwd: "/repo", secretRef: "VERCEL_TOKEN" })).toMatchObject({
      secretRef: "VERCEL_TOKEN",
    });
  });
});
