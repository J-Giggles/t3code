#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
const dockerSh = process.env.T3CODE_POD_DOCKER_SH;

console.log("[T6] provider persistence");
const shell = spawnSync(
  dockerSh.replace("t3-convex-docker.sh", "true"),
  [],
  { encoding: "utf8" },
);
void shell;
spawnSync("bash", ["-lc", `${dockerSh} shell ${slug} <<'EOF'
test -w /data/provider-config && touch /data/provider-config/.pod-test-marker
EOF`], { encoding: "utf8" });
console.log("T6 OK");
