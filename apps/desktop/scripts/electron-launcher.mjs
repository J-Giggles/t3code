// This file mostly exists because we want dev mode to say "T3 Code (Dev)" instead of "electron"

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const desktopDir = NodePath.resolve(__dirname, "..");
const repoRoot = NodePath.resolve(desktopDir, "..", "..");
const devBundleIdSuffix = NodePath.basename(repoRoot)
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "");
export const APP_DISPLAY_NAME = isDevelopment ? "T3 Code (Dev)" : "T3 Code (Alpha)";
export const APP_BUNDLE_ID = isDevelopment
  ? `com.t3tools.t3code.dev.${devBundleIdSuffix || "local"}`
  : "com.t3tools.t3code";
const APP_PROTOCOL_SCHEMES = isDevelopment ? ["t3code-dev"] : ["t3code"];
const LAUNCHER_VERSION = 16;
const defaultIconPath = NodePath.join(desktopDir, "resources", "icon.icns");
const macEntitlementsPath = NodePath.join(desktopDir, "resources", "entitlements.mac.plist");
const macChildEntitlementsPath = NodePath.join(
  desktopDir,
  "resources",
  "entitlements.mac.child.plist",
);
const macSignerPath = NodePath.join(desktopDir, "scripts", "sign-mac-launcher.mjs");
const developmentLaunchConfigFileName = `${APP_BUNDLE_ID.replaceAll(/[^a-z0-9.-]+/giu, "-")}.launch.json`;
const developmentMacIconPngPath = NodePath.join(
  repoRoot,
  "assets",
  "dev",
  "blueprint-macos-1024.png",
);
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone launcher script has no Effect runtime.
const hostPlatform = NodeOS.platform();

function setPlistString(plistPath, key, value) {
  const replaceResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-replace", key, "-string", value, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-insert", key, "-string", value, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
}

function setPlistJson(plistPath, key, value) {
  const serialized = JSON.stringify(value);
  const replaceResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-replace", key, "-json", serialized, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-insert", key, "-json", serialized, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
}

function runChecked(command, args) {
  const result = NodeChildProcess.spawnSync(command, args, { encoding: "utf8" });
  if (result.status === 0) {
    return;
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to run ${command} ${args.join(" ")}: ${details}`.trim());
}

export function makeDevelopmentLaunchConfig({ mainEntryPath, desktopRoot, environment }) {
  const fallbackEnvironment = Object.fromEntries(
    [
      ["VITE_DEV_SERVER_URL", environment.VITE_DEV_SERVER_URL],
      ["T3CODE_PORT", environment.T3CODE_PORT],
      ["T3CODE_HOME", environment.T3CODE_HOME],
      ["T3CODE_COMMIT_HASH", environment.T3CODE_COMMIT_HASH],
      ["T3CODE_OTLP_TRACES_URL", environment.T3CODE_OTLP_TRACES_URL],
      ["T3CODE_OTLP_EXPORT_INTERVAL_MS", environment.T3CODE_OTLP_EXPORT_INTERVAL_MS],
      ["T3CODE_DESKTOP_APP_USER_MODEL_ID", APP_BUNDLE_ID],
    ].filter((entry) => typeof entry[1] === "string" && entry[1].trim().length > 0),
  );

  return {
    desktopRoot,
    mainEntryPath,
    fallbackEnvironment,
  };
}

export function makeDevelopmentLauncherBootstrapScript({
  launchConfigFileName = developmentLaunchConfigFileName,
} = {}) {
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

function writeDevelopmentLaunchConfig(runtimeDir) {
  const launchConfigPath = NodePath.join(runtimeDir, developmentLaunchConfigFileName);
  const temporaryPath = `${launchConfigPath}.${process.pid}.tmp`;
  const config = makeDevelopmentLaunchConfig({
    mainEntryPath: NodePath.join(desktopDir, "dist-electron", "main.cjs"),
    desktopRoot: desktopDir,
    environment: process.env,
  });

  try {
    NodeFS.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
    NodeFS.renameSync(temporaryPath, launchConfigPath);
  } finally {
    NodeFS.rmSync(temporaryPath, { force: true });
  }
}

function writeDevelopmentLauncherBootstrap(appBundlePath) {
  const appResourcesPath = NodePath.join(appBundlePath, "Contents", "Resources", "app");
  NodeFS.rmSync(appResourcesPath, { recursive: true, force: true });
  NodeFS.mkdirSync(appResourcesPath, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(appResourcesPath, "package.json"),
    `${JSON.stringify(
      {
        name: "t3code",
        productName: APP_DISPLAY_NAME,
        private: true,
        main: "main.cjs",
      },
      null,
      2,
    )}\n`,
  );
  NodeFS.writeFileSync(
    NodePath.join(appResourcesPath, "main.cjs"),
    makeDevelopmentLauncherBootstrapScript(),
  );
}

function registerMacLauncherBundle(appBundlePath) {
  runChecked(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appBundlePath],
  );

  if (!isDevelopment) {
    return;
  }

  for (const scheme of APP_PROTOCOL_SCHEMES) {
    runChecked("osascript", [
      "-l",
      "JavaScript",
      "-e",
      [
        'ObjC.import("CoreServices");',
        `const scheme = $.NSString.alloc.initWithUTF8String(${JSON.stringify(scheme)});`,
        `const bundle = $.NSString.alloc.initWithUTF8String(${JSON.stringify(APP_BUNDLE_ID)});`,
        "const status = $.LSSetDefaultHandlerForURLScheme(scheme, bundle);",
        "if (status !== 0) throw new Error(`LSSetDefaultHandlerForURLScheme failed: ${status}`);",
      ].join(" "),
    ]);
  }
}

function ensureDevelopmentIconIcns(runtimeDir) {
  const generatedIconPath = NodePath.join(runtimeDir, "icon-dev.icns");
  NodeFS.mkdirSync(runtimeDir, { recursive: true });

  if (!NodeFS.existsSync(developmentMacIconPngPath)) {
    return defaultIconPath;
  }

  const sourceMtimeMs = NodeFS.statSync(developmentMacIconPngPath).mtimeMs;
  if (
    NodeFS.existsSync(generatedIconPath) &&
    NodeFS.statSync(generatedIconPath).mtimeMs >= sourceMtimeMs
  ) {
    return generatedIconPath;
  }

  const iconsetRoot = NodeFS.mkdtempSync(NodePath.join(runtimeDir, "dev-iconset-"));
  const iconsetDir = NodePath.join(iconsetRoot, "icon.iconset");
  NodeFS.mkdirSync(iconsetDir, { recursive: true });

  try {
    for (const size of [16, 32, 128, 256, 512]) {
      runChecked("sips", [
        "-z",
        String(size),
        String(size),
        developmentMacIconPngPath,
        "--out",
        NodePath.join(iconsetDir, `icon_${size}x${size}.png`),
      ]);

      const retinaSize = size * 2;
      runChecked("sips", [
        "-z",
        String(retinaSize),
        String(retinaSize),
        developmentMacIconPngPath,
        "--out",
        NodePath.join(iconsetDir, `icon_${size}x${size}@2x.png`),
      ]);
    }

    runChecked("iconutil", ["-c", "icns", iconsetDir, "-o", generatedIconPath]);
    return generatedIconPath;
  } catch (error) {
    console.warn(
      "[desktop-launcher] Failed to generate dev macOS icon, falling back to default icon.",
      error,
    );
    return defaultIconPath;
  } finally {
    NodeFS.rmSync(iconsetRoot, { recursive: true, force: true });
  }
}

function patchMainBundleInfoPlist(appBundlePath, iconPath) {
  const infoPlistPath = NodePath.join(appBundlePath, "Contents", "Info.plist");
  setPlistString(infoPlistPath, "CFBundleDisplayName", APP_DISPLAY_NAME);
  setPlistString(infoPlistPath, "CFBundleName", APP_DISPLAY_NAME);
  setPlistString(infoPlistPath, "CFBundleIdentifier", APP_BUNDLE_ID);
  setPlistString(infoPlistPath, "CFBundleIconFile", "icon.icns");
  setPlistString(
    infoPlistPath,
    "NSMicrophoneUsageDescription",
    "T3 Code uses the microphone for On-the-Go voice commands and Theo conversations.",
  );
  setPlistJson(infoPlistPath, "CFBundleURLTypes", [
    {
      CFBundleURLName: APP_BUNDLE_ID,
      CFBundleURLSchemes: APP_PROTOCOL_SCHEMES,
    },
  ]);

  const resourcesDir = NodePath.join(appBundlePath, "Contents", "Resources");
  NodeFS.copyFileSync(iconPath, NodePath.join(resourcesDir, "icon.icns"));
  NodeFS.copyFileSync(iconPath, NodePath.join(resourcesDir, "electron.icns"));
}

function signMacLauncherBundle(appBundlePath) {
  runChecked(process.execPath, [
    macSignerPath,
    appBundlePath,
    macEntitlementsPath,
    macChildEntitlementsPath,
  ]);
}

function patchHelperBundleInfoPlists(appBundlePath) {
  const helperBundleNames = [
    ["Electron Helper.app", "helper", `${APP_DISPLAY_NAME} Helper`],
    ["Electron Helper (GPU).app", "helper.gpu", `${APP_DISPLAY_NAME} Helper (GPU)`],
    ["Electron Helper (Plugin).app", "helper.plugin", `${APP_DISPLAY_NAME} Helper (Plugin)`],
    ["Electron Helper (Renderer).app", "helper.renderer", `${APP_DISPLAY_NAME} Helper (Renderer)`],
  ];

  for (const [bundleName, bundleIdentifierSuffix, bundleDisplayName] of helperBundleNames) {
    const infoPlistPath = NodePath.join(
      appBundlePath,
      "Contents",
      "Frameworks",
      bundleName,
      "Contents",
      "Info.plist",
    );
    if (!NodeFS.existsSync(infoPlistPath)) {
      continue;
    }

    setPlistString(infoPlistPath, "CFBundleDisplayName", bundleDisplayName);
    setPlistString(infoPlistPath, "CFBundleName", bundleDisplayName);
    setPlistString(
      infoPlistPath,
      "CFBundleIdentifier",
      `${APP_BUNDLE_ID}.${bundleIdentifierSuffix}`,
    );
  }
}

function readJson(path) {
  try {
    return JSON.parse(NodeFS.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function buildMacLauncher(electronBinaryPath) {
  const sourceAppBundlePath = NodePath.resolve(NodePath.dirname(electronBinaryPath), "../..");
  const runtimeDir = NodePath.join(desktopDir, ".electron-runtime");
  const targetAppBundlePath = NodePath.join(runtimeDir, `${APP_DISPLAY_NAME}.app`);
  const targetBinaryPath = NodePath.join(targetAppBundlePath, "Contents", "MacOS", "Electron");
  const iconPath = isDevelopment ? ensureDevelopmentIconIcns(runtimeDir) : defaultIconPath;
  const metadataPath = NodePath.join(runtimeDir, "metadata.json");

  NodeFS.mkdirSync(runtimeDir, { recursive: true });

  const expectedMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    sourceAppBundlePath,
    sourceAppMtimeMs: NodeFS.statSync(sourceAppBundlePath).mtimeMs,
    iconMtimeMs: NodeFS.statSync(iconPath).mtimeMs,
    entitlementsMtimeMs: NodeFS.statSync(macEntitlementsPath).mtimeMs,
    childEntitlementsMtimeMs: NodeFS.statSync(macChildEntitlementsPath).mtimeMs,
    appBundleId: APP_BUNDLE_ID,
    appProtocolSchemes: APP_PROTOCOL_SCHEMES,
  };

  const currentMetadata = readJson(metadataPath);
  if (isDevelopment) {
    writeDevelopmentLaunchConfig(runtimeDir);
  }
  if (
    NodeFS.existsSync(targetBinaryPath) &&
    currentMetadata &&
    JSON.stringify(currentMetadata) === JSON.stringify(expectedMetadata)
  ) {
    registerMacLauncherBundle(targetAppBundlePath);
    return targetBinaryPath;
  }

  NodeFS.rmSync(targetAppBundlePath, { recursive: true, force: true });
  // verbatimSymlinks keeps the framework's relative symlinks intact
  // (e.g. Resources -> Versions/Current/Resources). Without it cpSync
  // rewrites them to absolute paths into node_modules, which escape the
  // bundle and crash sandboxed helper processes (icudtl.dat not found).
  NodeFS.cpSync(sourceAppBundlePath, targetAppBundlePath, {
    recursive: true,
    verbatimSymlinks: true,
  });
  patchMainBundleInfoPlist(targetAppBundlePath, iconPath);
  patchHelperBundleInfoPlists(targetAppBundlePath);
  if (isDevelopment) {
    writeDevelopmentLauncherBootstrap(targetAppBundlePath);
  }
  signMacLauncherBundle(targetAppBundlePath);
  NodeFS.writeFileSync(metadataPath, `${JSON.stringify(expectedMetadata, null, 2)}\n`);
  registerMacLauncherBundle(targetAppBundlePath);

  return targetBinaryPath;
}

function isLinuxSetuidSandboxConfigured(electronBinaryPath) {
  if (hostPlatform !== "linux") {
    return true;
  }

  const sandboxPath = NodePath.join(NodePath.dirname(electronBinaryPath), "chrome-sandbox");
  try {
    const sandboxStat = NodeFS.statSync(sandboxPath);
    return sandboxStat.uid === 0 && (sandboxStat.mode & 0o4777) === 0o4755;
  } catch {
    return false;
  }
}

function resolveLinuxSandboxArgs(electronBinaryPath) {
  if (isLinuxSetuidSandboxConfigured(electronBinaryPath)) {
    return [];
  }

  console.warn(
    "[desktop-launcher] Electron chrome-sandbox is not root-owned with mode 4755; launching local Electron with --no-sandbox.",
  );
  return ["--no-sandbox"];
}

export function resolveElectronPath() {
  const electronBinaryPath = resolveElectronBinaryPath();

  if (hostPlatform !== "darwin") {
    return electronBinaryPath;
  }

  return buildMacLauncher(electronBinaryPath);
}

export function resolveElectronLaunchCommand(args = []) {
  const electronPath = resolveElectronPath();

  if (hostPlatform === "darwin") {
    const appBundlePath = NodePath.resolve(electronPath, "..", "..", "..");
    return {
      electronPath: "/usr/bin/open",
      args: ["-W", "-n", appBundlePath, "--args", ...args],
    };
  }

  return {
    electronPath,
    args: [...resolveLinuxSandboxArgs(electronPath), ...args],
  };
}

export function resolveElectronBinaryPath({
  ensureRuntime = ensureElectronRuntime,
  createRequire = NodeModule.createRequire,
  moduleUrl = import.meta.url,
} = {}) {
  ensureRuntime();

  const require = createRequire(moduleUrl);
  return require("electron");
}

export function resolveDevProtocolClient() {
  if (hostPlatform !== "darwin" || !isDevelopment) {
    return null;
  }

  const electronBinaryPath = resolveElectronBinaryPath();
  const launcherBinaryPath = buildMacLauncher(electronBinaryPath);
  return {
    appBundlePath: NodePath.resolve(launcherBinaryPath, "..", "..", ".."),
    appBundleId: APP_BUNDLE_ID,
  };
}
