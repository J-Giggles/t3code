#!/usr/bin/env node

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const bundleRoot = NodePath.dirname(fileURLToPath(import.meta.url));

/** Loads env JSON written by local-desktop-dev-bundle-run.ts before turbo starts. */
export function loadStackEnv(stackName) {
  const envPath = NodePath.join(bundleRoot, ".runtime", `${stackName}.env.json`);
  if (!NodeFS.existsSync(envPath)) {
    throw new Error(
      `Missing dev bundle env file: ${envPath}. Launch via t3code-local-dev, not turbo directly.`,
    );
  }
  const parsed = JSON.parse(NodeFS.readFileSync(envPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid dev bundle env file: ${envPath}`);
  }
  return parsed;
}
