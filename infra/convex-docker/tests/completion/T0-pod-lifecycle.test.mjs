#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INFRA_ROOT = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../..");
const provisionUrl = pathToFileURL(NodePath.join(INFRA_ROOT, "lib/provision.mjs")).href;

function sh(cmd, args = []) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `${cmd} failed`);
  return r.stdout;
}

function manifest(slug) {
  return JSON.parse(sh("node", [NodePath.join(INFRA_ROOT, "lib/provision.mjs"), "resolve", slug]));
}

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const dockerSh = process.env.T3CODE_POD_DOCKER_SH;

console.log(`[T0] pod lifecycle (${slug})`);
sh(dockerSh, ["preflight"]);
const m1 = manifest(slug);
const m2 = manifest(slug);
if (m1.ports.cloud !== m2.ports.cloud) throw new Error("T0.1 provision idempotent ports changed");
sh(dockerSh, ["health", slug]);
console.log("T0 OK");
