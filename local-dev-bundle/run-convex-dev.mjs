#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

import { loadStackEnv } from "./load-stack-env.mjs";
import {
  loadSharedConvexDeploymentEnv,
  withLocalAnonymousConvexCliEnv,
} from "../t3code-staging/packages/convex/scripts/convex-shared-deployment.mjs";

const workspaceRoot = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "..");
const stagingWorktree = NodePath.join(workspaceRoot, "t3code-staging");
const convexDevScript = NodePath.join(stagingWorktree, "packages/convex/scripts/convex-dev.mjs");

const stackEnv = loadStackEnv("convex");
const convexDataDir = stackEnv.T3CODE_CONVEX_DATA_DIR?.trim();
const sharedConvexEnv = convexDataDir ? loadSharedConvexDeploymentEnv(convexDataDir) : {};
const childEnv = withLocalAnonymousConvexCliEnv({
  ...process.env,
  ...stackEnv,
  ...sharedConvexEnv,
});

const child = NodeChildProcess.spawn(process.execPath, [convexDevScript], {
  cwd: NodePath.join(stagingWorktree, "packages/convex"),
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
