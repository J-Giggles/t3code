import * as NodePath from "node:path";

import { signAsync } from "@electron/osx-sign";

const [rawAppBundlePath, rawEntitlementsPath, rawChildEntitlementsPath] = process.argv.slice(2);
if (!rawAppBundlePath || !rawEntitlementsPath || !rawChildEntitlementsPath) {
  throw new Error(
    "Usage: sign-mac-launcher.mjs <app-bundle> <entitlements-plist> <child-entitlements-plist>",
  );
}

const appBundlePath = NodePath.resolve(rawAppBundlePath);
const entitlementsPath = NodePath.resolve(rawEntitlementsPath);
const childEntitlementsPath = NodePath.resolve(rawChildEntitlementsPath);

await signAsync({
  app: appBundlePath,
  platform: "darwin",
  identity: "-",
  identityValidation: false,
  preAutoEntitlements: false,
  preEmbedProvisioningProfile: false,
  strictVerify: true,
  optionsForFile: (filePath) => {
    const resolvedFilePath = NodePath.resolve(filePath);
    const entitlements =
      resolvedFilePath === appBundlePath
        ? entitlementsPath
        : resolvedFilePath.endsWith(".app")
          ? childEntitlementsPath
          : undefined;

    return {
      ...(entitlements ? { entitlements } : {}),
      hardenedRuntime: true,
      timestamp: "none",
    };
  },
});
