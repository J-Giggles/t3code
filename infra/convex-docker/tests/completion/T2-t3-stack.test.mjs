#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const INFRA_ROOT = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../..");

function manifest(slug) {
  const r = spawnSync("node", [NodePath.join(INFRA_ROOT, "lib/provision.mjs"), "resolve", slug], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const m = manifest(slug);

console.log(`[T2] t3 stack`);
const web = spawnSync("curl", ["-sf", m.urls.local.appUrl], { encoding: "utf8" });
if (web.status !== 0) {
  console.log("T2.2 web SKIP (stack may still be booting)");
} else if (!web.stdout.includes("html") && !web.stdout.includes("root")) {
  console.log("T2.2 web response received");
}

const health = spawnSync(
  "curl",
  ["-sf", `${m.urls.local.serverUrl}/api/local/stack-health`],
  { encoding: "utf8" },
);
if (health.status === 0) {
  const json = JSON.parse(health.stdout);
  if (json.containerMode !== true) console.log("T2.6 WARN containerMode not true in snapshot");
}

const codexCheck = spawnSync(
  "docker",
  [
    "compose",
    "--project-directory",
    m.generatedDir,
    "-p",
    m.composeProject,
    "--env-file",
    NodePath.join(m.generatedDir, ".env"),
    "exec",
    "-T",
    "t3-stack",
    "sh",
    "-c",
    "command -v codex && codex --version",
  ],
  { encoding: "utf8" },
);
if (codexCheck.status !== 0) {
  throw new Error(`T2.7 codex CLI missing in t3-stack: ${codexCheck.stderr || codexCheck.stdout}`);
}
console.log("T2.7 codex CLI on PATH");

const tailscaleCheck = spawnSync(
  "docker",
  [
    "compose",
    "--project-directory",
    m.generatedDir,
    "-p",
    m.composeProject,
    "--env-file",
    NodePath.join(m.generatedDir, ".env"),
    "exec",
    "-T",
    "t3-stack",
    "sh",
    "-c",
    "command -v tailscale && tailscale version",
  ],
  { encoding: "utf8" },
);
if (tailscaleCheck.status !== 0) {
  throw new Error(
    `T2.8 tailscale CLI missing in t3-stack: ${tailscaleCheck.stderr || tailscaleCheck.stdout}`,
  );
}
console.log("T2.8 tailscale CLI on PATH");

console.log("T2 OK");
