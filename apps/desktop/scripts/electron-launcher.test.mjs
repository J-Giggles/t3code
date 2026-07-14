import { assert, describe, it } from "vite-plus/test";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { resolveElectronBinaryPath, resolveElectronLaunchCommand } from "./electron-launcher.mjs";
import {
  makeDevelopmentLaunchConfig,
  makeDevelopmentLauncherBootstrapScript,
  normalizeElectronAppFrameworkSymlinks,
  resolveDarwinDevelopmentUserDataDir,
} from "./localTopics/onTheGo/mac-development-launcher.mjs";

describe("electron development launcher", () => {
  it("uses captured values only as fallbacks for a live runner environment", () => {
    const config = makeDevelopmentLaunchConfig({
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      appBundleId: "com.t3tools.t3code.dev.staging",
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        T3CODE_PORT: "16566",
        T3CODE_HOME: "/tmp/t3",
      },
    });
    const script = makeDevelopmentLauncherBootstrapScript({
      launchConfigFileName: "com.t3tools.t3code.dev.staging.launch.json",
    });

    assert.equal(config.fallbackEnvironment.VITE_DEV_SERVER_URL, "http://127.0.0.1:8526");
    assert.equal(config.fallbackEnvironment.T3CODE_PORT, "16566");
    assert.equal(config.fallbackEnvironment.T3CODE_HOME, "/tmp/t3");
    assert.equal(
      config.fallbackEnvironment.T3CODE_DESKTOP_APP_USER_MODEL_ID,
      "com.t3tools.t3code.dev.staging",
    );
    assert.include(script, "com.t3tools.t3code.dev.staging.launch.json");
    assert.include(script, "if (!process.env[name]");
    assert.notInclude(script, "http://127.0.0.1:8526");
    assert.include(script, "require(launchConfig.mainEntryPath)");
  });

  it("resolves the signed macOS app's isolated development user-data directory", () => {
    assert.equal(
      resolveDarwinDevelopmentUserDataDir({
        environment: {
          T3CODE_DEV_INSTANCE: " Staging Review ",
          T3CODE_WORKTREE_ROLE: "dev",
        },
        homeDirectory: "/Users/alice",
      }),
      "/Users/alice/Library/Application Support/t3code-dev-staging-review",
    );
  });

  it("repairs flattened Electron app framework aliases before signing", () => {
    const temporaryDirectory = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3code-electron-framework-"),
    );
    const appBundlePath = NodePath.join(temporaryDirectory, "T3 Code (Dev).app");
    const frameworksPath = NodePath.join(appBundlePath, "Contents", "Frameworks");

    try {
      for (const [frameworkName, aliases] of [
        ["Electron Framework.framework", ["Electron Framework", "Helpers", "Resources"]],
        ["Mantle.framework", ["Mantle", "Resources"]],
      ]) {
        const frameworkPath = NodePath.join(frameworksPath, frameworkName);
        const canonicalVersionPath = NodePath.join(frameworkPath, "Versions", "A");
        for (const name of aliases) {
          const canonicalPath = NodePath.join(canonicalVersionPath, name);
          const flattenedPath = NodePath.join(frameworkPath, name);
          if (name === "Electron Framework" || name === "Mantle") {
            NodeFS.mkdirSync(NodePath.dirname(canonicalPath), { recursive: true });
            NodeFS.writeFileSync(canonicalPath, "mach-o");
            NodeFS.writeFileSync(flattenedPath, "mach-o");
          } else {
            NodeFS.mkdirSync(canonicalPath, { recursive: true });
            NodeFS.mkdirSync(flattenedPath, { recursive: true });
          }
        }
        NodeFS.cpSync(canonicalVersionPath, NodePath.join(frameworkPath, "Versions", "Current"), {
          recursive: true,
        });
      }

      normalizeElectronAppFrameworkSymlinks({ appBundlePath });

      for (const [frameworkName, aliases] of [
        ["Electron Framework.framework", ["Electron Framework", "Helpers", "Resources"]],
        ["Mantle.framework", ["Mantle", "Resources"]],
      ]) {
        const frameworkPath = NodePath.join(frameworksPath, frameworkName);
        assert.equal(NodeFS.readlinkSync(NodePath.join(frameworkPath, "Versions", "Current")), "A");
        for (const name of aliases) {
          assert.equal(
            NodeFS.readlinkSync(NodePath.join(frameworkPath, name)),
            `Versions/Current/${name}`,
          );
        }
      }
    } finally {
      NodeFS.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(
      electronPath,
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });

  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone launcher tests gate real macOS bundle assertions before Effect exists.
  const macIt = NodeOS.platform() === "darwin" ? it : it.skip;

  macIt("launches the app bundle through LaunchServices so macOS owns privacy prompts", () => {
    const command = resolveElectronLaunchCommand(["--remote-debugging-port=9232"]);

    assert.equal(command.electronPath, "/usr/bin/open");
    assert.equal(command.args[0], "-W");
    assert.equal(command.args[1], "-n");
    assert.match(command.args[2] ?? "", /\.app$/u);
    assert.deepEqual(command.args.slice(3), ["--args", "--remote-debugging-port=9232"]);
  });

  macIt("prepares a signed microphone-entitled Mach-O app bundle", () => {
    const command = resolveElectronLaunchCommand([]);
    const appBundlePath = command.args[2];
    assert.ok(appBundlePath);

    const executablePath = NodePath.join(appBundlePath, "Contents", "MacOS", "Electron");
    const fileResult = NodeChildProcess.spawnSync("/usr/bin/file", ["-b", executablePath], {
      encoding: "utf8",
    });
    assert.equal(fileResult.status, 0, fileResult.stderr);
    assert.include(fileResult.stdout, "Mach-O");

    const verifyResult = NodeChildProcess.spawnSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", appBundlePath],
      { encoding: "utf8" },
    );
    assert.equal(verifyResult.status, 0, verifyResult.stderr);

    const entitlementResult = NodeChildProcess.spawnSync(
      "/usr/bin/codesign",
      ["--display", "--entitlements", ":-", appBundlePath],
      { encoding: "utf8" },
    );
    assert.equal(entitlementResult.status, 0, entitlementResult.stderr);
    assert.include(
      `${entitlementResult.stdout}\n${entitlementResult.stderr}`,
      "com.apple.security.device.audio-input",
    );
    assert.include(
      `${entitlementResult.stdout}\n${entitlementResult.stderr}`,
      "com.apple.security.cs.disable-library-validation",
    );

    const helperNames = [
      "Electron Helper.app",
      "Electron Helper (GPU).app",
      "Electron Helper (Plugin).app",
      "Electron Helper (Renderer).app",
    ];
    for (const helperName of helperNames) {
      const helperResult = NodeChildProcess.spawnSync(
        "/usr/bin/codesign",
        [
          "--display",
          "--entitlements",
          ":-",
          NodePath.join(appBundlePath, "Contents", "Frameworks", helperName),
        ],
        { encoding: "utf8" },
      );
      assert.equal(helperResult.status, 0, helperResult.stderr);
      assert.include(
        `${helperResult.stdout}\n${helperResult.stderr}`,
        "com.apple.security.cs.disable-library-validation",
      );
    }
  });

  macIt("keeps the development app executable signed Mach-O", () => {
    const launcherModuleUrl = new URL("./electron-launcher.mjs", import.meta.url).href;
    const childScript = [
      `import { resolveElectronLaunchCommand } from ${JSON.stringify(launcherModuleUrl)};`,
      "console.log(`COMMAND:${JSON.stringify(resolveElectronLaunchCommand([]))}`);",
    ].join("\n");
    const childResult = NodeChildProcess.spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", childScript],
      {
        cwd: NodePath.dirname(new URL(import.meta.url).pathname),
        encoding: "utf8",
        env: {
          ...process.env,
          VITE_DEV_SERVER_URL: "http://127.0.0.1:5793/staging/",
          T3CODE_PORT: "13833",
          T3CODE_HOME: "/tmp/t3code-launcher-test",
        },
      },
    );
    assert.equal(childResult.status, 0, childResult.stderr);

    const commandLine = childResult.stdout.split("\n").find((line) => line.startsWith("COMMAND:"));
    assert.ok(commandLine, childResult.stdout);
    const command = JSON.parse(commandLine.slice("COMMAND:".length));
    const appBundlePath = command.args[2];
    assert.match(appBundlePath, /T3 Code \(Dev\)\.app$/u);

    const launcherPackage = JSON.parse(
      NodeFS.readFileSync(
        NodePath.join(appBundlePath, "Contents", "Resources", "app", "package.json"),
        "utf8",
      ),
    );
    assert.equal(launcherPackage.name, "t3code");
    assert.equal(launcherPackage.productName, "T3 Code (Dev)");

    const executablePath = NodePath.join(appBundlePath, "Contents", "MacOS", "Electron");
    const fileResult = NodeChildProcess.spawnSync("/usr/bin/file", ["-b", executablePath], {
      encoding: "utf8",
    });
    assert.equal(fileResult.status, 0, fileResult.stderr);
    assert.include(fileResult.stdout, "Mach-O");

    const verifyResult = NodeChildProcess.spawnSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", appBundlePath],
      { encoding: "utf8" },
    );
    assert.equal(verifyResult.status, 0, verifyResult.stderr);
  });
});
