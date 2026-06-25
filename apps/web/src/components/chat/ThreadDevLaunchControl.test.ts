import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type DesktopDevLaunchRecord,
  type LocalApi,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildDevLaunchProfileRows,
  buildDevLaunchThreadContext,
  describeDevLaunchCollision,
  getDevLaunchesForThread,
  openDevLaunchPublicUrl,
  resolveThreadDevLaunchTriggerPresentation,
  resolveThreadDevLaunchApi,
  summarizeDevLaunchProfiles,
} from "./ThreadDevLaunchControl";

const threadRef = {
  environmentId: EnvironmentId.make("environment-local"),
  threadId: ThreadId.make("thread-1"),
};

const launchRecord: DesktopDevLaunchRecord = {
  threadRef,
  projectId: ProjectId.make("project-1"),
  projectRoot: "/tmp/project",
  projectSlug: "project",
  canonicalWorktreePath: "/tmp/project",
  worktreeSlug: "feature-branch",
  profileId: "web",
  profileName: "Web App",
  profileCwd: "apps/web",
  appSegment: "web",
  localPort: 5173,
  localHost: "127.0.0.1",
  localUrl: "http://127.0.0.1:5173",
  publicPath: "/project/feature-branch/web/",
  publicUrl: "https://desktop.tailnet.ts.net/project/feature-branch/web/",
  pid: 12345,
  startedAt: "2026-06-16T17:00:00.000Z",
  status: "running",
};

const apiLaunchRecord: DesktopDevLaunchRecord = {
  ...launchRecord,
  profileId: "api",
  profileName: "API",
  profileCwd: "apps/api",
  appSegment: "api",
  localPort: 8787,
  localUrl: "http://127.0.0.1:8787",
  publicPath: "/project/feature-branch/api/",
  publicUrl: "https://desktop.tailnet.ts.net/project/feature-branch/api/",
  pid: 12346,
};

const webProfile = {
  id: "web",
  name: "Web App",
  cwd: "apps/web",
  command: "pnpm dev",
  healthCheckPath: "/",
  host: "127.0.0.1",
  port: 5173,
  envBindings: [],
};

describe("openDevLaunchPublicUrl", () => {
  it("opens the Tailscale public URL returned by a successful launch", async () => {
    const openExternal = vi.fn(async () => undefined);
    const localApi = {
      shell: {
        openExternal,
      },
    } as unknown as LocalApi;

    await openDevLaunchPublicUrl(localApi, {
      current: launchRecord,
      active: [launchRecord],
    });

    expect(openExternal).toHaveBeenCalledWith(launchRecord.publicUrl);
  });

  it("does not open a URL when launch state has no current app", async () => {
    const openExternal = vi.fn(async () => undefined);
    const localApi = {
      shell: {
        openExternal,
      },
    } as unknown as LocalApi;

    await openDevLaunchPublicUrl(localApi, {
      current: null,
      active: [],
    });

    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("resolveThreadDevLaunchApi", () => {
  function makeDevLaunchApi() {
    return {
      getDevLaunchState: vi.fn(),
      launchDevApp: vi.fn(),
      stopDevApp: vi.fn(),
      listActiveDevLaunches: vi.fn(),
      buildDevLaunchCollisionPrompt: vi.fn(),
    };
  }

  it("falls back to the server API when desktop bridge methods are unavailable", () => {
    const server = makeDevLaunchApi();
    const localApi = { server } as unknown as LocalApi;

    expect(resolveThreadDevLaunchApi(localApi)).toBe(server);
  });

  it("prefers desktop bridge methods when both transports are available", () => {
    const server = makeDevLaunchApi();
    const desktop = makeDevLaunchApi();
    const localApi = { desktop, server } as unknown as LocalApi;

    expect(resolveThreadDevLaunchApi(localApi)).toBe(desktop);
  });
});

describe("buildDevLaunchThreadContext", () => {
  it("shows the active branch and worktree path", () => {
    expect(
      buildDevLaunchThreadContext({
        branch: "feat/invoices",
        projectRoot: "/repo/invoice",
        worktreePath: "/repo/invoice/.worktrees/feat-invoices",
      }),
    ).toEqual({
      branch: "feat/invoices",
      worktreePath: "/repo/invoice/.worktrees/feat-invoices",
    });
  });

  it("falls back to the project root when there is no separate worktree path", () => {
    expect(
      buildDevLaunchThreadContext({
        branch: "main",
        projectRoot: "/repo/invoice",
        worktreePath: null,
      }),
    ).toEqual({
      branch: "main",
      worktreePath: "/repo/invoice",
    });
  });

  it("uses explicit unknown labels when branch and workspace are blank", () => {
    expect(
      buildDevLaunchThreadContext({
        branch: " ",
        projectRoot: " ",
        worktreePath: null,
      }),
    ).toEqual({
      branch: "unknown",
      worktreePath: "unknown",
    });
  });
});

describe("dev launch stack helpers", () => {
  it("uses stable trigger labels and setup tooltip copy when no profiles exist", () => {
    expect(
      resolveThreadDevLaunchTriggerPresentation({
        profiles: [],
        runningCount: 0,
        warnings: [],
      }),
    ).toEqual({
      ariaLabel: "Set up dev app launch",
      tooltip: "Set up dev app launch for this project.",
    });
  });

  it("uses dropdown menu copy for stopped profiles", () => {
    expect(
      resolveThreadDevLaunchTriggerPresentation({
        profiles: [webProfile],
        runningCount: 0,
        warnings: [],
      }),
    ).toEqual({
      ariaLabel: "Open dev app launch menu",
      tooltip: "Open dev app launch menu.",
    });
  });

  it("uses running management copy and lets warnings lead the tooltip", () => {
    expect(
      resolveThreadDevLaunchTriggerPresentation({
        profiles: [webProfile],
        runningCount: 1,
        warnings: [{ message: "Worktree already has an app running." }],
      }),
    ).toEqual({
      ariaLabel: "Manage running dev apps",
      tooltip: "Worktree already has an app running.",
    });
  });

  it("selects all active launches for the current thread", () => {
    const otherThreadLaunch = {
      ...launchRecord,
      threadRef: {
        environmentId: EnvironmentId.make("environment-local"),
        threadId: ThreadId.make("thread-other"),
      },
      pid: 12347,
    };

    expect(
      getDevLaunchesForThread({
        state: {
          current: apiLaunchRecord,
          active: [launchRecord, apiLaunchRecord, otherThreadLaunch],
        },
        threadRef,
      }).map((launch) => launch.profileId),
    ).toEqual(["web", "api"]);
  });

  it("builds profile rows with running launches and stopped profiles", () => {
    const rows = buildDevLaunchProfileRows({
      profiles: [
        webProfile,
        {
          id: "api",
          name: "API",
          cwd: "apps/api",
          command: "pnpm dev",
          healthCheckPath: "/healthz",
          host: "127.0.0.1",
          port: 8787,
          envBindings: [],
        },
        {
          id: "docs",
          name: "Docs",
          cwd: "apps/docs",
          command: "pnpm dev",
          healthCheckPath: "/",
          host: "127.0.0.1",
          port: 6006,
          envBindings: [],
        },
      ],
      launches: [launchRecord, apiLaunchRecord],
    });

    expect(rows.map((row) => [row.profile.id, row.launch?.publicUrl ?? null])).toEqual([
      ["web", launchRecord.publicUrl],
      ["api", apiLaunchRecord.publicUrl],
      ["docs", null],
    ]);
  });

  it("summarizes profile command, port, and health data for fix prompts", () => {
    expect(summarizeDevLaunchProfiles([webProfile])).toContain(
      "Web App (web): pnpm dev in apps/web on 127.0.0.1:5173, health /",
    );
  });

  it("describes route conflicts with route and existing proxy", () => {
    expect(
      describeDevLaunchCollision({
        type: "route-conflict",
        requestedProfileId: "web",
        servePath: "/staging",
        servePort: 443,
        existingProxyUrl: "http://127.0.0.1:13833",
        expectedProxyUrl: "http://127.0.0.1:3020/staging",
      }),
    ).toBe("Route /staging is already taken by http://127.0.0.1:13833.");
  });
});
