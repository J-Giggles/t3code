import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import {
  type DevAppLaunchManagerShape,
  makeDevAppLaunchManager,
} from "@t3tools/shared/devAppLaunchRuntime";
import { parsePersistedServerPromptOverrides } from "@t3tools/shared/serverSettings";
import {
  assertTailscaleMagicDnsResolvable,
  assertTailscaleServePathAvailable,
  disableTailscaleServe,
  ensureTailscaleServe,
  readTailscaleStatus,
} from "@t3tools/tailscale";

import { DesktopEnvironment } from "../app/DesktopEnvironment.ts";

export {
  buildDevLaunchChildEnv,
  checkDevLaunchLocalPortAvailable,
  DevAppLaunchError as DesktopDevLaunchError,
  findActiveDevLaunchForWorktreeProfile,
  replaceDevLaunchProfileRecord,
  resolveDevLaunchWorkspacePath,
  selectCurrentDevLaunchForThread,
  selectDevLaunchesForThread,
  updateDotenvContent,
} from "@t3tools/shared/devAppLaunchRuntime";

export type DesktopDevAppLaunchManagerShape = DevAppLaunchManagerShape;

export class DesktopDevAppLaunchManager extends Context.Service<
  DesktopDevAppLaunchManager,
  DesktopDevAppLaunchManagerShape
>()("@t3tools/desktop/backend/DesktopDevAppLaunchManager") {}

export const DesktopDevAppLaunchManagerLive = Layer.effect(
  DesktopDevAppLaunchManager,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const manager = yield* makeDevAppLaunchManager({
      config: {
        inheritedEnv: process.env,
        serverPublicBasePath: environment.defaultDesktopSettings.tailscaleServePath,
        stateDir: environment.stateDir,
      },
      resolvePromptOverrides: fileSystem.readFileString(environment.serverSettingsPath).pipe(
        Effect.map(parsePersistedServerPromptOverrides),
        Effect.orElseSucceed(() => ({})),
      ),
      tailscale: {
        assertMagicDnsResolvable: assertTailscaleMagicDnsResolvable,
        assertServePathAvailable: assertTailscaleServePathAvailable,
        disableServe: disableTailscaleServe,
        ensureServe: ensureTailscaleServe,
        readStatus: readTailscaleStatus,
      },
    });
    return DesktopDevAppLaunchManager.of(manager);
  }),
);
