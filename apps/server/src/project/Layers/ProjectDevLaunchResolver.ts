// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  DEV_LAUNCH_MANIFEST_RELATIVE_PATH,
  parseProjectDevLaunchManifest,
} from "@t3tools/shared/devLaunch";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  ProjectDevLaunchResolver,
  type ProjectDevLaunchResolution,
  type ProjectDevLaunchResolverShape,
} from "../Services/ProjectDevLaunchResolver.ts";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}

const emptyResolution: ProjectDevLaunchResolution = { profiles: [], warnings: [] };

async function resolveForWorkspaceAsync(
  workspaceRoot: string,
): Promise<ProjectDevLaunchResolution> {
  const manifestPath = NodePath.join(workspaceRoot, DEV_LAUNCH_MANIFEST_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await NodeFSP.readFile(manifestPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return emptyResolution;
    }
    return {
      profiles: [],
      warnings: [
        {
          message: `Could not read ${DEV_LAUNCH_MANIFEST_RELATIVE_PATH}: ${errorMessage(error)}`,
        },
      ],
    };
  }

  try {
    const manifest = await Effect.runPromise(parseProjectDevLaunchManifest(raw));
    return { profiles: manifest.profiles, warnings: [] };
  } catch (error) {
    return {
      profiles: [],
      warnings: [
        {
          message: `Invalid ${DEV_LAUNCH_MANIFEST_RELATIVE_PATH}: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

export const makeProjectDevLaunchResolver = Effect.sync(() =>
  ProjectDevLaunchResolver.of({
    resolveForWorkspace: (workspaceRoot) =>
      Effect.promise(() => resolveForWorkspaceAsync(workspaceRoot)),
  } satisfies ProjectDevLaunchResolverShape),
);

export const ProjectDevLaunchResolverLive = Layer.effect(
  ProjectDevLaunchResolver,
  makeProjectDevLaunchResolver,
);
