import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import {
  type DevAppLaunchManagerShape,
  makeDevAppLaunchManager,
} from "@t3tools/shared/devAppLaunchRuntime";
import { DEFAULT_PUBLIC_PATH_PREFIX } from "@t3tools/shared/publicPath";
import {
  assertTailscaleMagicDnsResolvable,
  assertTailscaleServePathAvailable,
  disableTailscaleServe,
  ensureTailscaleServe,
  readTailscaleStatus,
} from "@t3tools/tailscale";
import { parsePersistedServerPromptOverrides } from "@t3tools/shared/serverSettings";

import { ServerConfig } from "../config.ts";

export type ServerDevAppLaunchManagerShape = DevAppLaunchManagerShape;

export class ServerDevAppLaunchManager extends Context.Service<
  ServerDevAppLaunchManager,
  ServerDevAppLaunchManagerShape
>()("t3/devLaunch/ServerDevAppLaunchManager") {}

export const ServerDevAppLaunchManagerLive = Layer.effect(
  ServerDevAppLaunchManager,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const fileSystem = yield* FileSystem.FileSystem;
    const manager = yield* makeDevAppLaunchManager({
      config: {
        inheritedEnv: process.env,
        serverPublicBasePath: config.tailscaleServePath ?? DEFAULT_PUBLIC_PATH_PREFIX,
        stateDir: config.stateDir,
      },
      resolvePromptOverrides: fileSystem.readFileString(config.settingsPath).pipe(
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
    return ServerDevAppLaunchManager.of(manager);
  }),
);
