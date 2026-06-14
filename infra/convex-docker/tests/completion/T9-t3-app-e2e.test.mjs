#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../../../..");
const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";

console.log("[T9] t3 app e2e");
const e2e = NodePath.join(WORKSPACE, "t3code-staging/scripts/pod-completion-e2e.ts");
const r = spawnSync("bun", [e2e, "--slug", slug], {
  cwd: NodePath.join(WORKSPACE, "t3code-staging"),
  encoding: "utf8",
});
if (r.status !== 0) {
  console.log(r.stdout);
  console.log(r.stderr);
  throw new Error("T9 failed");
}
console.log("T9 OK");
