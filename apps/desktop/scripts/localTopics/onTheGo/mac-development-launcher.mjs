import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const ON_THE_GO_MICROPHONE_USAGE_DESCRIPTION =
  "T3 Code uses the microphone for On-the-Go voice commands and Theo conversations.";

export function resolveDevelopmentLaunchConfigFileName(appBundleId) {
  return `${appBundleId.replaceAll(/[^a-z0-9.-]+/giu, "-")}.launch.json`;
}

export function makeDevelopmentLaunchConfig({
  mainEntryPath,
  desktopRoot,
  appBundleId,
  environment,
}) {
  const fallbackEnvironment = Object.fromEntries(
    [
      ["VITE_DEV_SERVER_URL", environment.VITE_DEV_SERVER_URL],
      ["T3CODE_PORT", environment.T3CODE_PORT],
      ["T3CODE_HOME", environment.T3CODE_HOME],
      ["T3CODE_COMMIT_HASH", environment.T3CODE_COMMIT_HASH],
      ["T3CODE_OTLP_TRACES_URL", environment.T3CODE_OTLP_TRACES_URL],
      ["T3CODE_OTLP_EXPORT_INTERVAL_MS", environment.T3CODE_OTLP_EXPORT_INTERVAL_MS],
      ["T3CODE_DESKTOP_APP_USER_MODEL_ID", appBundleId],
    ].filter((entry) => typeof entry[1] === "string" && entry[1].trim().length > 0),
  );

  return {
    desktopRoot,
    mainEntryPath,
    fallbackEnvironment,
  };
}

export function makeDevelopmentLauncherBootstrapScript({ launchConfigFileName }) {
  return [
    '"use strict";',
    'const NodeFS = require("node:fs");',
    'const NodePath = require("node:path");',
    `const launchConfigPath = NodePath.resolve(__dirname, "..", "..", "..", "..", ${JSON.stringify(launchConfigFileName)});`,
    'const launchConfig = JSON.parse(NodeFS.readFileSync(launchConfigPath, "utf8"));',
    "for (const [name, value] of Object.entries(launchConfig.fallbackEnvironment ?? {})) {",
    '  if (!process.env[name] && typeof value === "string" && value.length > 0) process.env[name] = value;',
    "}",
    'if (!process.argv.some((value) => value.startsWith("--t3code-dev-root="))) {',
    "  process.argv.push(`--t3code-dev-root=${launchConfig.desktopRoot}`);",
    "}",
    "require(launchConfig.mainEntryPath);",
    "",
  ].join("\n");
}

export function refreshDevelopmentLaunchConfig({
  runtimeDir,
  desktopRoot,
  appBundleId,
  environment,
}) {
  const launchConfigFileName = resolveDevelopmentLaunchConfigFileName(appBundleId);
  const launchConfigPath = NodePath.join(runtimeDir, launchConfigFileName);
  const temporaryPath = `${launchConfigPath}.${process.pid}.tmp`;
  const config = makeDevelopmentLaunchConfig({
    mainEntryPath: NodePath.join(desktopRoot, "dist-electron", "main.cjs"),
    desktopRoot,
    appBundleId,
    environment,
  });

  try {
    NodeFS.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
    NodeFS.renameSync(temporaryPath, launchConfigPath);
  } finally {
    NodeFS.rmSync(temporaryPath, { force: true });
  }
}

export function installDevelopmentLauncherBootstrap({
  appBundlePath,
  appDisplayName,
  appBundleId,
}) {
  const appResourcesPath = NodePath.join(appBundlePath, "Contents", "Resources", "app");
  NodeFS.rmSync(appResourcesPath, { recursive: true, force: true });
  NodeFS.mkdirSync(appResourcesPath, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(appResourcesPath, "package.json"),
    `${JSON.stringify(
      {
        name: "t3code",
        productName: appDisplayName,
        private: true,
        main: "main.cjs",
      },
      null,
      2,
    )}\n`,
  );
  NodeFS.writeFileSync(
    NodePath.join(appResourcesPath, "main.cjs"),
    makeDevelopmentLauncherBootstrapScript({
      launchConfigFileName: resolveDevelopmentLaunchConfigFileName(appBundleId),
    }),
  );
}

export function makeDarwinLaunchServicesCommand({ electronPath, args }) {
  return {
    electronPath: "/usr/bin/open",
    args: ["-W", "-n", NodePath.resolve(electronPath, "..", "..", ".."), "--args", ...args],
  };
}

export function resolveDarwinDevelopmentUserDataDir({ environment, homeDirectory }) {
  const rawIdentity = environment.T3CODE_DEV_INSTANCE ?? environment.T3CODE_WORKTREE_ROLE ?? "";
  const identity = rawIdentity
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .replaceAll(/-{2,}/gu, "-");
  const directoryName = identity.length > 0 ? `t3code-dev-${identity}` : "t3code-dev";
  return NodePath.join(homeDirectory, "Library", "Application Support", directoryName);
}

export function cleanupDarwinDevProcesses({
  devRootArg,
  signal,
  spawnSync = NodeChildProcess.spawnSync,
}) {
  const matches = spawnSync("pgrep", ["-f", "--", devRootArg], { encoding: "utf8" });
  if (matches.status === 0 && typeof matches.stdout === "string") {
    for (const pid of matches.stdout.split("\n").map((value) => value.trim())) {
      if (!/^\d+$/u.test(pid)) {
        continue;
      }
      spawnSync("pkill", [`-${signal}`, "-P", pid], { stdio: "ignore" });
    }
  }

  spawnSync("pkill", [`-${signal}`, "-f", "--", devRootArg], { stdio: "ignore" });
}

export function signalDarwinDevProcess({
  devRootArg,
  signal,
  spawnSync = NodeChildProcess.spawnSync,
}) {
  spawnSync("pkill", [`-${signal}`, "-f", "--", devRootArg], { stdio: "ignore" });
}
