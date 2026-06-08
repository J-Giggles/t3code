#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import { loadStackEnv } from "./load-stack-env.mjs";

const stackName = process.argv[2]?.trim();
const appName = process.argv[3]?.trim();

const APP_SPECS = {
  web: {
    relativeCwd: ".",
    command: ["node", "scripts/dev-runner.ts", "dev:web"],
  },
  desktop: {
    relativeCwd: ".",
    command: ["node", "scripts/dev-runner.ts", "dev:desktop-bundle"],
  },
  "t3-build": {
    relativeCwd: "apps/server",
    command: ["node", "scripts/dev-server.mjs"],
  },
};

if (stackName !== "main" && stackName !== "staging") {
  console.error("Usage: run-worktree-app.mjs main|staging web|desktop|t3-build");
  process.exit(1);
}

const appSpec = APP_SPECS[appName];
if (!appSpec) {
  console.error("Usage: run-worktree-app.mjs main|staging web|desktop|t3-build");
  process.exit(1);
}

const stackEnv = loadStackEnv(stackName);
const worktreePath = stackEnv.T3CODE_APP_ROOT?.trim();
if (!worktreePath) {
  throw new Error(`T3CODE_APP_ROOT missing in ${stackName} stack env`);
}

const worktreeBin = NodePath.join(worktreePath, "node_modules", ".bin");
const childEnv = {
  ...process.env,
  ...stackEnv,
  T3CODE_TURBO_UI: "stream",
  PATH: [worktreeBin, process.env.PATH].filter(Boolean).join(":"),
};

const child = NodeChildProcess.spawn(appSpec.command[0], appSpec.command.slice(1), {
  cwd: NodePath.join(worktreePath, appSpec.relativeCwd),
  env: childEnv,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
