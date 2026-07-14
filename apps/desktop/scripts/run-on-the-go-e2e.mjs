import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const desktopDir = NodePath.resolve(__dirname, "..");
const repoRoot = NodePath.resolve(desktopDir, "../..");

function readOptionalEnvFile(path) {
  return NodeFS.existsSync(path) ? NodeUtil.parseEnv(NodeFS.readFileSync(path, "utf8")) : {};
}

Object.assign(process.env, {
  ...readOptionalEnvFile(NodePath.resolve(repoRoot, ".env")),
  ...readOptionalEnvFile(NodePath.resolve(repoRoot, ".env.local")),
  ...process.env,
});

const mode = process.argv[2] ?? "smoke";
if (mode !== "smoke" && mode !== "headed") {
  console.error(`Unknown desktop E2E mode '${mode}'. Expected smoke or headed.`);
  process.exit(1);
}
const passthroughArgs = process.argv.slice(3);
if (passthroughArgs[0] === "--") {
  passthroughArgs.shift();
}

// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone E2E launcher chooses xvfb on Linux before Effect exists.
const isLinux = process.platform === "linux";
const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const isUnderXvfb = process.env.T3CODE_E2E_UNDER_XVFB === "1";
if (isLinux && !hasDisplay && !isUnderXvfb) {
  const xvfb = NodeChildProcess.spawnSync("sh", ["-lc", "command -v xvfb-run"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const xvfbPath = xvfb.stdout.trim();
  if (!xvfbPath) {
    console.error(
      "Desktop E2E requires DISPLAY on Linux. Install xvfb-run or run in a headed session.",
    );
    process.exit(1);
  }

  const child = NodeChildProcess.spawn(
    xvfbPath,
    ["-a", process.execPath, NodeURL.fileURLToPath(import.meta.url), mode, ...passthroughArgs],
    {
      cwd: desktopDir,
      stdio: "inherit",
      env: {
        ...process.env,
        T3CODE_E2E_UNDER_XVFB: "1",
      },
    },
  );
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
} else {
  const args = ["exec", "playwright", "test", "--config", "playwright.on-the-go.config.ts"];
  if (mode === "smoke") {
    args.push("--grep", "@smoke");
  }
  args.push(...passthroughArgs);

  const child = NodeChildProcess.spawn("pnpm", args, {
    cwd: desktopDir,
    stdio: "inherit",
    env: {
      ...process.env,
      T3CODE_E2E_SUITE: mode,
    },
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
