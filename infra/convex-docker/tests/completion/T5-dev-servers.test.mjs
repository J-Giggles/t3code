#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = NodePath.join(
  NodePath.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/sample-vite-app",
);
const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const dockerSh = process.env.T3CODE_POD_DOCKER_SH;

console.log("[T5] dev servers");
const m = JSON.parse(
  spawnSync("node", [
    NodePath.join(NodePath.dirname(fileURLToPath(import.meta.url)), "../../lib/provision.mjs"),
    "resolve",
    slug,
  ], { encoding: "utf8" }).stdout,
);

const codeRoot = m.codeRoot;
const target = NodePath.join(codeRoot, "sample-vite-app");
NodeFS.mkdirSync(codeRoot, { recursive: true });
if (!NodeFS.existsSync(target)) {
  NodeFS.cpSync(FIXTURE, target, { recursive: true });
}

spawnSync(dockerSh, ["dev-start", slug, "sample-vite-app"], { encoding: "utf8", stdio: "inherit" });
console.log("T5 OK");
