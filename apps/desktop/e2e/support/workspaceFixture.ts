// @effect-diagnostics nodeBuiltinImport:off - E2E fixtures create real temp repositories.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { Page } from "playwright/test";

import type { ElectronHarness } from "./electronHarness.ts";

const desktopDir = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../..",
);
const repoRoot = NodePath.resolve(desktopDir, "../..");
const devServerFixturePath = NodePath.join(desktopDir, "e2e", "fixtures", "dev-server.mjs");

export interface WorkspaceFixture {
  readonly root: string;
  readonly title: string;
  readonly devServerPort: number;
  readonly apiServerPort: number;
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}:\n${output}`));
    });
  });
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = NodeNet.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close(() => resolve(port));
        return;
      }
      server.close(() => reject(new Error("Could not allocate a free fixture port.")));
    });
  });
}

export async function createWorkspaceFixture(input: {
  readonly parentDir: string;
  readonly title?: string;
}): Promise<WorkspaceFixture> {
  const root = await NodeFSP.mkdtemp(NodePath.join(input.parentDir, "workspace-"));
  const title = input.title ?? `E2E Fixture ${NodePath.basename(root).replace("workspace-", "")}`;
  const devServerPort = await findFreePort();
  let apiServerPort = await findFreePort();
  while (apiServerPort === devServerPort) {
    apiServerPort = await findFreePort();
  }
  await NodeFSP.mkdir(NodePath.join(root, ".t3code"), { recursive: true });
  await NodeFSP.writeFile(NodePath.join(root, "tracked.txt"), "committed\n");
  await NodeFSP.writeFile(
    NodePath.join(root, "package.json"),
    `${JSON.stringify({ type: "module" })}\n`,
  );
  await NodeFSP.writeFile(
    NodePath.join(root, ".t3code", "dev-apps.json"),
    `${JSON.stringify(
      {
        version: 1,
        profiles: [
          {
            id: "web",
            name: "Fixture Web",
            cwd: ".",
            command: `node ${JSON.stringify(devServerFixturePath)} --host 127.0.0.1 --port ${devServerPort}`,
            healthCheckPath: "/healthz",
            host: "127.0.0.1",
            port: devServerPort,
            envBindings: [
              {
                file: ".env.local",
                key: "T3CODE_E2E_PUBLIC_BASE_URL",
                value: "{{publicBaseUrl}}",
              },
            ],
          },
          {
            id: "api",
            name: "Fixture API",
            cwd: ".",
            command: `node ${JSON.stringify(devServerFixturePath)} --host 127.0.0.1 --port ${apiServerPort}`,
            healthCheckPath: "/healthz",
            host: "127.0.0.1",
            port: apiServerPort,
            envBindings: [
              {
                file: ".env.local",
                key: "T3CODE_E2E_API_PUBLIC_BASE_URL",
                value: "{{publicBaseUrl}}",
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  await runCommand("git", ["init", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.email", "e2e@example.invalid"], { cwd: root });
  await runCommand("git", ["config", "user.name", "T3 Code E2E"], { cwd: root });
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-m", "Initial fixture commit"], { cwd: root });
  await NodeFSP.writeFile(NodePath.join(root, "tracked.txt"), "modified\n");
  await NodeFSP.writeFile(NodePath.join(root, "untracked.txt"), "local only\n");

  return { root, title, devServerPort, apiServerPort };
}

export async function addFixtureProject(
  harness: ElectronHarness,
  fixture: WorkspaceFixture,
): Promise<void> {
  await runCommand(
    process.execPath,
    [
      NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs"),
      "project",
      "add",
      fixture.root,
      "--title",
      fixture.title,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        T3CODE_HOME: harness.t3Home,
        VITE_DEV_SERVER_URL: harness.devServerUrl,
      },
    },
  );
}

export async function ensureProjectVisible(page: Page, title: string): Promise<void> {
  const project = page.getByText(title, { exact: true }).first();
  try {
    await project.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.reload();
    await project.waitFor({ state: "visible", timeout: 20_000 });
  }
}

export async function openProjectDraftThread(page: Page, title: string): Promise<void> {
  await page.goto(`${new URL(page.url()).origin}/#/`);
  await page.waitForLoadState("domcontentloaded");
  await ensureProjectVisible(page, title);
  await page.getByText(title, { exact: true }).first().hover();
  await Promise.all([
    page.waitForURL(/\/#\/draft\/[^/]+$/u, { timeout: 60_000 }),
    page.getByRole("button", { name: `Create new thread in ${title}` }).click({ force: true }),
  ]);
  await page.getByTestId("composer-editor").waitFor({ state: "visible", timeout: 20_000 });
  await page
    .getByRole("button", { name: "Open project Git dashboard" })
    .waitFor({ state: "visible", timeout: 20_000 });
}

export async function addAndOpenFixtureProject(
  harness: ElectronHarness,
  fixture: WorkspaceFixture,
): Promise<void> {
  await addFixtureProject(harness, fixture);
  await openProjectDraftThread(harness.page, fixture.title);
}
