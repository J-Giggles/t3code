import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type DesktopDevLaunchRecord,
} from "@t3tools/contracts";
import * as NodeNet from "node:net";
import { describe, expect, it } from "vitest";

import {
  buildDevLaunchChildEnv,
  checkDevLaunchLocalPortAvailable,
  DesktopDevLaunchError,
  findActiveDevLaunchForWorktreeProfile,
  replaceDevLaunchProfileRecord,
  resolveDevLaunchWorkspacePath,
  selectCurrentDevLaunchForThread,
  selectDevLaunchesForThread,
  updateDotenvContent,
} from "./DesktopDevAppLaunchManager.ts";

const threadRef = {
  environmentId: EnvironmentId.make("environment-local"),
  threadId: ThreadId.make("thread-1"),
};

const baseLaunch: DesktopDevLaunchRecord = {
  threadRef,
  projectId: ProjectId.make("project-1"),
  projectRoot: "/repo/project",
  projectSlug: "project",
  canonicalWorktreePath: "/repo/project/.worktrees/feature",
  worktreeSlug: "feature",
  profileId: "web",
  profileName: "Web",
  profileCwd: "apps/web",
  appSegment: "web",
  localPort: 3000,
  localHost: "127.0.0.1",
  localUrl: "http://127.0.0.1:3000",
  publicPath: "/project/feature/web/",
  publicUrl: "https://desktop.tailnet.ts.net/project/feature/web/",
  pid: 1001,
  startedAt: "2026-01-01T00:00:00.000Z",
  status: "running",
};

describe("DesktopDevAppLaunchManager helpers", () => {
  it("updates dotenv keys without dropping unrelated lines", () => {
    expect(
      updateDotenvContent("HOST=localhost\n# keep me\nPORT=3000\n", {
        HOST: "127.0.0.1",
        PORT: "5173",
        APP_BASE_PATH: "/t3-code/staging/app/",
      }),
    ).toBe("HOST=127.0.0.1\n# keep me\nPORT=5173\nAPP_BASE_PATH=/t3-code/staging/app/\n");
  });

  it("overrides inherited child env with rendered launcher bindings", () => {
    const env = buildDevLaunchChildEnv({
      inheritedEnv: {
        PATH: "/usr/bin",
        PORT: "5733",
        HOST: "0.0.0.0",
      },
      envBindings: [
        { key: "HOST", value: "{{host}}" },
        { key: "PORT", value: "{{port}}" },
        { key: "NEXT_PUBLIC_APP_URL", value: "{{publicBaseUrl}}" },
      ],
      values: {
        host: "127.0.0.1",
        port: 3030,
        branch: "main",
        localHttpUrl: "http://127.0.0.1:3030",
        publicOrigin: "https://desktop.tailnet.ts.net",
        publicBasePath: "/project/main/web/",
        publicBaseUrl: "https://desktop.tailnet.ts.net/project/main/web",
        serverPublicBasePath: "/t3code-staging/",
        serverPublicBaseUrl: "https://desktop.tailnet.ts.net/t3code-staging",
        projectSlug: "project",
        worktreeSlug: "main",
        appSegment: "web",
      },
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe("3030");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://desktop.tailnet.ts.net/project/main/web");
  });

  it("resolves manifest paths inside the workspace", () => {
    expect(
      resolveDevLaunchWorkspacePath({
        workspaceRoot: "/repo/project",
        relativePath: "apps/web/.env.local",
        fieldName: "env binding file",
      }),
    ).toBe("/repo/project/apps/web/.env.local");
    expect(
      resolveDevLaunchWorkspacePath({
        workspaceRoot: "/repo/project",
        relativePath: ".",
        fieldName: "profile cwd",
      }),
    ).toBe("/repo/project");
  });

  it("rejects manifest paths that escape the workspace", () => {
    expect(() =>
      resolveDevLaunchWorkspacePath({
        workspaceRoot: "/repo/project",
        relativePath: "../outside.env",
        fieldName: "env binding file",
      }),
    ).toThrow(DesktopDevLaunchError);
  });

  it("rejects absolute manifest paths", () => {
    expect(() =>
      resolveDevLaunchWorkspacePath({
        workspaceRoot: "/repo/project",
        relativePath: "/tmp/outside.env",
        fieldName: "env binding file",
      }),
    ).toThrow(/relative to the project workspace/u);
  });

  it("detects unmanaged local port occupancy before launch", async () => {
    const server = NodeNet.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port: 0 }, resolve);
    });

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }
      await expect(
        checkDevLaunchLocalPortAvailable({
          host: "127.0.0.1",
          port: address.port,
        }),
      ).resolves.toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("selects all active launches for a thread and reports the latest as current", () => {
    const apiLaunch: DesktopDevLaunchRecord = {
      ...baseLaunch,
      profileId: "api",
      profileName: "API",
      appSegment: "api",
      localPort: 8787,
      localUrl: "http://127.0.0.1:8787",
      publicPath: "/project/feature/api/",
      publicUrl: "https://desktop.tailnet.ts.net/project/feature/api/",
      pid: 1002,
    };

    const active = [baseLaunch, apiLaunch];

    expect(selectDevLaunchesForThread({ active, threadRef })).toEqual(active);
    expect(selectCurrentDevLaunchForThread({ active, threadRef })).toBe(apiLaunch);
  });

  it("allows different profiles from the same worktree while detecting duplicate profiles", () => {
    expect(
      findActiveDevLaunchForWorktreeProfile({
        active: [baseLaunch],
        canonicalWorktreePath: baseLaunch.canonicalWorktreePath,
        profileId: "api",
      }),
    ).toBeNull();
    expect(
      findActiveDevLaunchForWorktreeProfile({
        active: [baseLaunch],
        canonicalWorktreePath: baseLaunch.canonicalWorktreePath,
        profileId: "web",
      }),
    ).toBe(baseLaunch);
  });

  it("replaces only the matching profile launch for a thread", () => {
    const apiLaunch: DesktopDevLaunchRecord = {
      ...baseLaunch,
      profileId: "api",
      profileName: "API",
      appSegment: "api",
      localPort: 8787,
      localUrl: "http://127.0.0.1:8787",
      publicPath: "/project/feature/api/",
      publicUrl: "https://desktop.tailnet.ts.net/project/feature/api/",
      pid: 1002,
    };
    const replacementWeb: DesktopDevLaunchRecord = {
      ...baseLaunch,
      pid: 2001,
      startedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(
      replaceDevLaunchProfileRecord({
        active: [baseLaunch, apiLaunch],
        nextLaunch: replacementWeb,
      }).map((launch) => [launch.profileId, launch.pid]),
    ).toEqual([
      ["api", 1002],
      ["web", 2001],
    ]);
  });
});
