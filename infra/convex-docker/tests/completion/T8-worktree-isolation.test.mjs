#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const INFRA_ROOT = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../..");

function manifest(slug) {
  const r = spawnSync("node", [NodePath.join(INFRA_ROOT, "lib/provision.mjs"), "resolve", slug], {
    encoding: "utf8",
  });
  return JSON.parse(r.stdout);
}

const main = manifest("t3code-main");
const staging = manifest("t3code-staging");
if (main.instanceName === staging.instanceName) throw new Error("T8.2 same instance name");
if (main.ports.cloud === staging.ports.cloud) throw new Error("T8.2 same convex port");
console.log("[T8] worktree isolation OK");
