// @effect-diagnostics nodeBuiltinImport:off - Desktop route ownership must inspect the real git worktree.
import {
  checkTailscaleReservedServeRouteOwner,
  type TailscaleReservedServeRouteConflict,
  type TailscaleServeRouteOwnerIdentity,
} from "@t3tools/shared/publicPath";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

function readGitOutput(appRoot: string, args: readonly string[]): string | null {
  const result = NodeChildProcess.spawnSync("git", ["-C", appRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return null;
  }
  const output = result.stdout.trim();
  return output.length > 0 ? output : null;
}

export function readDesktopTailscaleRouteOwnerIdentity(
  appRoot: string,
): TailscaleServeRouteOwnerIdentity {
  const topLevelPath = readGitOutput(appRoot, ["rev-parse", "--show-toplevel"]) ?? appRoot;
  const branch = readGitOutput(appRoot, ["branch", "--show-current"]);
  const worktreeBasename = NodePath.basename(topLevelPath);
  return {
    branch,
    topLevelPath,
    worktreeBasename,
  };
}

export function checkDesktopTailscaleReservedServeRoute(input: {
  readonly appRoot: string;
  readonly route: string;
}): TailscaleReservedServeRouteConflict | null {
  return checkTailscaleReservedServeRouteOwner({
    route: input.route,
    identity: readDesktopTailscaleRouteOwnerIdentity(input.appRoot),
  });
}
