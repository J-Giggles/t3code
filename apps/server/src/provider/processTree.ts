// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";

import * as Effect from "effect/Effect";

function parseProcStatParentPid(raw: string): number | undefined {
  const commandEnd = raw.lastIndexOf(")");
  if (commandEnd < 0) {
    return undefined;
  }

  const fields = raw
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/g);
  const parentPid = Number(fields[1]);
  return Number.isInteger(parentPid) && parentPid > 0 ? parentPid : undefined;
}

function readLinuxProcessParentPid(pid: number): number | undefined {
  try {
    return parseProcStatParentPid(NodeFS.readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return undefined;
  }
}

function collectLinuxDescendantPids(rootPid: number): ReadonlyArray<number> {
  let entries: ReadonlyArray<string>;
  try {
    entries = NodeFS.readdirSync("/proc");
  } catch {
    return [];
  }

  const childrenByParent = new Map<number, number[]>();
  for (const entry of entries) {
    const pid = Number(entry);
    if (!Number.isInteger(pid) || pid <= 0 || pid === rootPid) {
      continue;
    }

    const parentPid = readLinuxProcessParentPid(pid);
    if (parentPid === undefined) {
      continue;
    }

    const children = childrenByParent.get(parentPid);
    if (children) {
      children.push(pid);
    } else {
      childrenByParent.set(parentPid, [pid]);
    }
  }

  const descendants: number[] = [];
  const stack = [...(childrenByParent.get(rootPid) ?? [])];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (pid === undefined) {
      continue;
    }
    descendants.push(pid);
    stack.push(...(childrenByParent.get(pid) ?? []));
  }

  return descendants;
}

function collectDescendantPids(rootPid: number, platform: NodeJS.Platform): ReadonlyArray<number> {
  return platform === "linux" ? collectLinuxDescendantPids(rootPid) : [];
}

const signalPid = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(pid, signal);
  } catch {
    // Best-effort cleanup: the process may already be gone.
  }
};

function collectProcessTreePids(rootPid: number, platform: NodeJS.Platform): ReadonlyArray<number> {
  return [rootPid, ...collectDescendantPids(rootPid, platform)];
}

const signalProcessTargets = (
  targets: ReadonlyArray<number>,
  signal: NodeJS.Signals,
): Effect.Effect<void> =>
  Effect.sync(() => {
    for (const pid of targets) {
      signalPid(pid, signal);
    }
  });

export function terminateProcessTree(
  rootPid: number,
  platform: NodeJS.Platform,
): Effect.Effect<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    return Effect.void;
  }

  return Effect.sync(() => collectProcessTreePids(rootPid, platform)).pipe(
    Effect.flatMap((initialTargets) =>
      signalProcessTargets(initialTargets, "SIGTERM").pipe(
        Effect.andThen(Effect.sleep("1 second")),
        Effect.andThen(
          Effect.sync(() => [
            ...new Set([...initialTargets, ...collectProcessTreePids(rootPid, platform)]),
          ]),
        ),
        Effect.flatMap((finalTargets) => signalProcessTargets(finalTargets, "SIGKILL")),
      ),
    ),
    Effect.ignore,
  );
}
