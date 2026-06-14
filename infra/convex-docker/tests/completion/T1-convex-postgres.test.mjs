#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const INFRA_ROOT = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../..");

function sh(cmd, args = []) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `${cmd} failed`);
  return r.stdout;
}

function manifest(slug) {
  return JSON.parse(sh("node", [NodePath.join(INFRA_ROOT, "lib/provision.mjs"), "resolve", slug]));
}

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const m = manifest(slug);
const convexUrl = m.urls.local.convexUrl;

console.log(`[T1] convex postgres (${convexUrl})`);
const curl = spawnSync("curl", ["-sf", `${convexUrl}/version`], { encoding: "utf8" });
if (curl.status !== 0) throw new Error("T1.2 convex /version failed");

const adminKeyPath = NodePath.join(m.worktreePath, ".local/convex-docker/admin.key");
if (spawnSync("test", ["-f", adminKeyPath]).status !== 0) {
  console.log("T1.3 SKIP no admin key — run keys command first");
} else {
  sh(process.env.T3CODE_POD_DOCKER_SH, ["deploy", slug]);
}
console.log("T1 OK");
