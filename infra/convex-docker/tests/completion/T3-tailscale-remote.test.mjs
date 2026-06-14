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

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const m = manifest(slug);

if (m.localOnly) {
  console.log("[T3] SKIP tailscale tests (LOCAL_ONLY pod)");
  process.exit(0);
}

console.log("[T3] tailscale remote");
const status = spawnSync("tailscale", ["status", "--json"], { encoding: "utf8" });
if (status.status !== 0) {
  console.log("T3 SKIP tailscale not available");
  process.exit(0);
}
console.log("T3 OK");
