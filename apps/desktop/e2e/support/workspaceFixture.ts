// @effect-diagnostics nodeBuiltinImport:off - Headed E2E fixtures create an isolated real repository.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { ElectronHarness } from "./electronHarness.ts";

const desktopDir = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../..",
);
const repoRoot = NodePath.resolve(desktopDir, "../..");

export interface WorkspaceFixture {
  readonly root: string;
  readonly title: string;
}

const runCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv },
) =>
  new Promise<void>((resolve, reject) => {
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
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}:\n${output}`));
    });
  });

export const createWorkspaceFixture = async (input: {
  readonly parentDir: string;
  readonly title?: string;
}): Promise<WorkspaceFixture> => {
  const root = await NodeFSP.mkdtemp(NodePath.join(input.parentDir, "on-the-go-workspace-"));
  const title = input.title ?? `On-the-Go ${NodePath.basename(root)}`;
  await NodeFSP.writeFile(
    NodePath.join(root, "README.md"),
    "# Voice fixture\n\nAuthentication is fail closed.\n",
  );
  await NodeFSP.writeFile(NodePath.join(root, "package.json"), '{"type":"module"}\n');
  await runCommand("git", ["init", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.email", "e2e@example.invalid"], { cwd: root });
  await runCommand("git", ["config", "user.name", "T3 Code E2E"], { cwd: root });
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-m", "Initial fixture"], { cwd: root });
  return { root, title };
};

export const addAndOpenFixtureProject = async (
  harness: ElectronHarness,
  fixture: WorkspaceFixture,
) => {
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
  const project = harness.page.getByText(fixture.title, { exact: true }).first();
  try {
    await project.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await harness.page.reload();
    await project.waitFor({ state: "visible", timeout: 20_000 });
  }
  await project.hover();
  await Promise.all([
    harness.page.waitForURL(/\/#\/draft\/[^/]+$/u, { timeout: 60_000 }),
    harness.page
      .getByRole("button", { name: `Create new thread in ${fixture.title}` })
      .click({ force: true }),
  ]);
  await harness.page.getByTestId("composer-editor").waitFor({ state: "visible" });
};
