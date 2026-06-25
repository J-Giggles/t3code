import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type DesktopDevLaunchCollision,
} from "@t3tools/contracts";
import { PROMPT_IDS, getPromptDefaultHash } from "./prompts.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDevLaunchFailurePrompt,
  buildDevLaunchSetupPrompt,
  buildDevLaunchCollisionPrompt,
  buildDevLaunchPublicUrl,
  joinDevLaunchPublicPath,
  renderDevLaunchHealthCheckPath,
  renderDevLaunchTemplate,
  resolveAppSegment,
  resolveProjectSlug,
  resolveWorktreeSlug,
} from "./devLaunch.ts";

describe("devLaunch", () => {
  const setupInput = {
    threadRef: {
      environmentId: EnvironmentId.make("environment-1"),
      threadId: ThreadId.make("thread-1"),
    },
    projectId: ProjectId.make("project-1"),
    projectName: "Invoice",
    projectRoot: "/repos/invoice",
    worktreePath: "/repos/invoice/.worktrees/feature",
    branch: "feature",
  };

  it("builds stable public paths and URLs", () => {
    const projectSlug = resolveProjectSlug("T3 Code");
    const worktreeSlug = resolveWorktreeSlug({
      canonicalWorktreePath: "/repos/t3code/.worktrees/staging",
      branch: "feat/dev launch",
    });
    const appSegment = resolveAppSegment({
      profile: {
        id: "web",
        name: "Web App",
        cwd: "apps/web",
        command: "pnpm dev",
        healthCheckPath: "/",
        host: "127.0.0.1",
        port: 3000,
        envBindings: [],
      },
      profileCount: 1,
    });

    expect(projectSlug).toBe("t3-code");
    expect(worktreeSlug).toBe("staging");
    expect(appSegment).toBe("app");
    expect(joinDevLaunchPublicPath({ projectSlug, worktreeSlug, appSegment })).toBe(
      "/t3-code/staging/app/",
    );
    expect(
      buildDevLaunchPublicUrl({
        magicDnsName: "desktop.tail.ts.net",
        publicPath: "/t3-code/staging/app/",
      }),
    ).toBe("https://desktop.tail.ts.net/t3-code/staging/app/");
  });

  it("renders launcher env templates", () => {
    const values = {
      host: "127.0.0.1",
      port: 3000,
      branch: "main",
      localHttpUrl: "http://127.0.0.1:3000",
      publicOrigin: "https://desktop.tail.ts.net",
      publicBasePath: "/project/worktree/app/",
      publicBaseUrl: "https://desktop.tail.ts.net/project/worktree/app",
      serverPublicBasePath: "/staging/",
      serverPublicBaseUrl: "https://desktop.tail.ts.net/staging",
      projectSlug: "project",
      worktreeSlug: "worktree",
      appSegment: "app",
    };

    expect(
      renderDevLaunchTemplate(
        "{{host}}:{{port}} {{publicBaseUrl}} {{serverPublicBaseUrl}} {{branch}}",
        values,
      ),
    ).toBe(
      "127.0.0.1:3000 https://desktop.tail.ts.net/project/worktree/app https://desktop.tail.ts.net/staging main",
    );
    expect(renderDevLaunchHealthCheckPath("{{publicBasePath}}", values)).toBe(
      "/project/worktree/app/",
    );
    expect(renderDevLaunchHealthCheckPath("healthz", values)).toBe("/healthz");
  });

  it("builds collision helper prompts", () => {
    const collision: DesktopDevLaunchCollision = {
      type: "port-conflict",
      requestedProfileId: "web",
      requestedPort: 3000,
      blocking: {
        threadRef: {
          environmentId: EnvironmentId.make("environment-1"),
          threadId: ThreadId.make("thread-1"),
        },
        projectId: ProjectId.make("project-1"),
        projectRoot: "/repo",
        projectSlug: "project",
        canonicalWorktreePath: "/repo/.worktrees/main",
        worktreeSlug: "main",
        profileId: "web",
        profileName: "Web App",
        profileCwd: "apps/web",
        appSegment: "app",
        localPort: 3000,
        localHost: "127.0.0.1",
        localUrl: "http://127.0.0.1:3000",
        publicPath: "/project/main/app/",
        publicUrl: "https://desktop.tail.ts.net/project/main/app/",
        pid: 123,
        startedAt: "2026-01-01T00:00:00.000Z",
        status: "running",
      },
    };

    expect(buildDevLaunchCollisionPrompt({ collision, projectName: "Project" })).toContain(
      "Use the dev-launch-collision-avoidance skill.",
    );
    expect(
      buildDevLaunchCollisionPrompt({
        collision,
        projectName: "Project",
        promptOverrides: {
          [PROMPT_IDS.devLaunchCollision]: {
            content: "Collision {{projectName}} {{blockingProfileName}} {{reason}}",
            defaultHash: getPromptDefaultHash(PROMPT_IDS.devLaunchCollision),
          },
        },
      }),
    ).toContain("Collision Project Web App The requested host port 3000 is already in use");
  });

  it("builds route conflict helper prompts", () => {
    const collision: DesktopDevLaunchCollision = {
      type: "route-conflict",
      requestedProfileId: "web",
      servePath: "/staging",
      servePort: 443,
      existingProxyUrl: "http://127.0.0.1:13833",
      expectedProxyUrl: "http://127.0.0.1:3020/staging",
    };

    const prompt = buildDevLaunchCollisionPrompt({ collision, projectName: "Project" });

    expect(prompt).toContain("Route /staging is already taken by http://127.0.0.1:13833");
    expect(prompt).toContain("this launch expects http://127.0.0.1:3020/staging");
  });

  it("keeps Tailscale ownership out of target project setup prompts", () => {
    const prompt = buildDevLaunchSetupPrompt(setupInput);

    expect(prompt).toContain("T3 Code owns Tailscale Serve setup");
    expect(prompt).toContain("Do not install Tailscale packages");
    expect(prompt).toContain("The target repo should only run its normal local dev server");
    expect(prompt).toContain(
      "use {{publicBasePath}} and {{publicBaseUrl}} for the app's own base path and app URL values",
    );
    expect(prompt).toContain(
      "use {{serverPublicBasePath}} and {{serverPublicBaseUrl}} only for callbacks to the T3 Code backend",
    );
    expect(prompt).toContain("healthCheckPath must resolve to a 2xx route");
    expect(prompt).toContain(
      "health checks must bypass auth, locale, proxy, and middleware redirects",
    );
    expect(prompt).toContain("{{publicBasePath}}t3code-health.txt");
  });

  it("builds a generic setup prompt for single apps, monorepos, APIs, and tooling apps", () => {
    const prompt = buildDevLaunchSetupPrompt(setupInput);

    expect(prompt).toContain("Inspect the package manager and lockfile");
    expect(prompt).toContain("Inspect workspace files");
    expect(prompt).toContain("framework configs");
    expect(prompt).toContain("env examples");
    expect(prompt).toContain("gitignore rules");
    expect(prompt).toContain("single app");
    expect(prompt).toContain("monorepo");
    expect(prompt).toContain("app plus API/backend");
    expect(prompt).toContain("API-only");
    expect(prompt).toContain("docs/storybook/tooling app");
    expect(prompt).toContain("unknown/custom");
  });

  it("instructs setup agents to include dependent APIs and stable app ids", () => {
    const prompt = buildDevLaunchSetupPrompt(setupInput);

    expect(prompt).toContain("Include APIs/workers when browser apps depend on them");
    expect(prompt).toContain("one profile per reachable app/API/tool target");
    expect(prompt).toContain("app, web, admin, api, docs, storybook, shop, or dashboard");
    expect(prompt).toContain("monorepos should expose all launched apps");
  });

  it("requires gitignore-aware setup and remote Tailscale Vite verification", () => {
    const prompt = buildDevLaunchSetupPrompt(setupInput);

    expect(prompt).toContain("Follow the user's gitignore preference");
    expect(prompt).toContain("Use gitignored package-local env files");
    expect(prompt).toContain("remote T3 Code Vite client over Tailscale HTTPS");
    expect(prompt).toContain("not only with localhost");
  });

  it("uses setup prompt overrides", () => {
    const prompt = buildDevLaunchSetupPrompt(setupInput, {
      promptOverrides: {
        [PROMPT_IDS.devLaunchSetup]: {
          content: "Setup {{projectName}} at {{workspaceRoot}} on {{branch}}",
          defaultHash: getPromptDefaultHash(PROMPT_IDS.devLaunchSetup),
        },
      },
    });

    expect(prompt).toBe("Setup Invoice at /repos/invoice/.worktrees/feature on feature");
  });

  it("builds retry prompts with concrete launch failure evidence", () => {
    const prompt = buildDevLaunchFailurePrompt({
      setup: setupInput,
      profile: {
        id: "api",
        name: "API",
        cwd: "apps/api",
        command: "pnpm dev",
        healthCheckPath: "{{publicBasePath}}",
        host: "127.0.0.1",
        port: 3020,
        envBindings: [],
      },
      errorMessage: "Timed out waiting for http://127.0.0.1:3020/project/worktree/api/",
      remoteClientUrl: "https://giggabit.tailfb378a.ts.net/t3code-staging/",
      failureKind: "health check",
      manifestSummary: "- API (api): pnpm dev",
    });

    expect(prompt).toContain("retry/fix prompt");
    expect(prompt).toContain("profile id: api");
    expect(prompt).toContain("command: pnpm dev");
    expect(prompt).toContain("port: 3020");
    expect(prompt).toContain("healthCheckPath: {{publicBasePath}}");
    expect(prompt).toContain("expected local URL: http://127.0.0.1:3020");
    expect(prompt).toContain(
      "Remote T3 Code client: https://giggabit.tailfb378a.ts.net/t3code-staging/",
    );
    expect(prompt).toContain("failure kind: health check");
    expect(prompt).toContain("Current manifest summary");
    expect(prompt).toContain("broadly useful setup instruction");
  });

  it("uses failure prompt overrides", () => {
    const prompt = buildDevLaunchFailurePrompt({
      setup: setupInput,
      profile: {
        id: "api",
        name: "API",
        cwd: "apps/api",
        command: "pnpm dev",
        healthCheckPath: "{{publicBasePath}}",
        host: "127.0.0.1",
        port: 3020,
        envBindings: [],
      },
      errorMessage: "Timed out",
      failureKind: "health check",
      promptOverrides: {
        [PROMPT_IDS.devLaunchFailure]: {
          content: "Failure {{projectName}} {{profileName}} {{failureKind}} {{errorMessage}}",
          defaultHash: getPromptDefaultHash(PROMPT_IDS.devLaunchFailure),
        },
      },
    });

    expect(prompt).toBe("Failure Invoice API health check Timed out");
  });
});
