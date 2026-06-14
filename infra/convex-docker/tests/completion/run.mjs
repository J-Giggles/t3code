#!/usr/bin/env node
/**
 * Completion test orchestrator for per-worktree Docker pods.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = NodePath.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = NodePath.resolve(TESTS_DIR, "../../../..");
const DOCKER_SH = NodePath.join(WORKSPACE_ROOT, ".agents/scripts/t3-convex-docker.sh");

const SUITES = {
  quick: ["T0-pod-lifecycle.test.mjs", "T1-convex-postgres.test.mjs", "T2-t3-stack.test.mjs"],
  remote: ["T3-tailscale-remote.test.mjs"],
  full: [
    "T0-pod-lifecycle.test.mjs",
    "T1-convex-postgres.test.mjs",
    "T2-t3-stack.test.mjs",
    "T3-tailscale-remote.test.mjs",
    "T4-desktop.test.mjs",
    "T5-dev-servers.test.mjs",
    "T6-providers-persist.test.mjs",
    "T7-promotion.test.mjs",
    "T8-worktree-isolation.test.mjs",
    "T9-t3-app-e2e.test.mjs",
  ],
  completion: [
    "T0-pod-lifecycle.test.mjs",
    "T1-convex-postgres.test.mjs",
    "T2-t3-stack.test.mjs",
    "T3-tailscale-remote.test.mjs",
    "T4-desktop.test.mjs",
    "T5-dev-servers.test.mjs",
    "T6-providers-persist.test.mjs",
    "T7-promotion.test.mjs",
    "T8-worktree-isolation.test.mjs",
    "T9-t3-app-e2e.test.mjs",
  ],
};

function parseArgs(argv) {
  let suite = "quick";
  let slug = process.env.T3CODE_POD_TEST_SLUG ?? "t3code-staging";
  let skipManual = false;
  let reportPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--suite") suite = argv[++i];
    else if (argv[i] === "--slug") slug = argv[++i];
    else if (argv[i] === "--skip-manual") skipManual = true;
    else if (argv[i] === "--report") reportPath = argv[++i];
  }
  return { suite, slug, skipManual, reportPath };
}

function runTest(file, ctx) {
  const started = Date.now();
  const result = NodeChildProcess.spawnSync(process.execPath, [NodePath.join(TESTS_DIR, file)], {
    env: { ...process.env, ...ctx },
    encoding: "utf8",
  });
  return {
    file,
    status: result.status === 0 ? "PASS" : "FAIL",
    durationMs: Date.now() - started,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function main() {
  const { suite, slug, skipManual, reportPath } = parseArgs(process.argv.slice(2));
  const files = SUITES[suite];
  if (!files) {
    console.error(`Unknown suite: ${suite}`);
    process.exit(1);
  }

  const ctx = {
    T3CODE_POD_TEST_SLUG: slug,
    T3CODE_POD_TEST_SKIP_MANUAL: skipManual ? "1" : "",
    T3CODE_POD_DOCKER_SH: DOCKER_SH,
    T3CODE_POD_WORKSPACE: WORKSPACE_ROOT,
  };

  const results = files.map((file) => runTest(file, ctx));
  const summary = results.map((r) => ({
    id: r.file.replace(".test.mjs", ""),
    status: r.status,
    durationMs: r.durationMs,
    error: r.status === "FAIL" ? r.stderr.slice(0, 500) : undefined,
  }));

  console.log("\nCOMPLETION TEST SUMMARY");
  for (const row of summary) {
    console.log(`  ${row.id}  ${row.status}  (${row.durationMs}ms)`);
    if (row.error) console.log(`    ${row.error}`);
  }

  const failed = summary.filter((r) => r.status === "FAIL").length;
  const overall = failed === 0 ? "PASS" : "FAIL";
  console.log(`OVERALL: ${overall}`);

  if (reportPath) {
    NodeFS.mkdirSync(NodePath.dirname(reportPath), { recursive: true });
    NodeFS.writeFileSync(
      reportPath,
      `${JSON.stringify({ suite, slug, summary, overall, at: new Date().toISOString() }, null, 2)}\n`,
    );
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
