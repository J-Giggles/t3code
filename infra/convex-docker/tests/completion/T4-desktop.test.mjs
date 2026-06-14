#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const dockerSh = process.env.T3CODE_POD_DOCKER_SH;
const skipManual = process.env.T3CODE_POD_TEST_SKIP_MANUAL === "1";

console.log("[T4] desktop");
spawnSync(dockerSh, ["desktop", slug, "start"], { encoding: "utf8" });

if (!skipManual) {
  console.log("T4.3 MANUAL: confirm Electron window via ssh -Y (or skip with --skip-manual)");
}
console.log("T4 OK");
