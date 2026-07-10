export const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

export interface DependencyVersionReconciliation {
  readonly section: (typeof DEPENDENCY_SECTIONS)[number];
  readonly name: string;
  readonly from: string;
  readonly to: string;
}

function exactVersionTuple(version: string): ReadonlyArray<number> | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(version);
  return match === null ? undefined : match.slice(1, 4).map((part) => Number.parseInt(part, 10));
}

function compareVersionTuples(left: ReadonlyArray<number>, right: ReadonlyArray<number>): number {
  for (let index = 0; index < 3; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function reconcileUpstreamExactDependencyVersions(
  currentManifest: Record<string, unknown>,
  upstreamManifest: Record<string, unknown>,
): {
  readonly manifest: Record<string, unknown>;
  readonly changes: ReadonlyArray<DependencyVersionReconciliation>;
} {
  const manifest = structuredClone(currentManifest);
  const changes: Array<DependencyVersionReconciliation> = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const current = manifest[section];
    const upstream = upstreamManifest[section];
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      typeof upstream !== "object" ||
      upstream === null ||
      Array.isArray(upstream)
    ) {
      continue;
    }
    const currentDependencies = current as Record<string, unknown>;
    const upstreamDependencies = upstream as Record<string, unknown>;
    for (const [name, upstreamVersion] of Object.entries(upstreamDependencies)) {
      const currentVersion = currentDependencies[name];
      if (typeof currentVersion !== "string" || typeof upstreamVersion !== "string") continue;
      const currentTuple = exactVersionTuple(currentVersion);
      const upstreamTuple = exactVersionTuple(upstreamVersion);
      if (
        currentTuple === undefined ||
        upstreamTuple === undefined ||
        compareVersionTuples(currentTuple, upstreamTuple) >= 0
      ) {
        continue;
      }
      currentDependencies[name] = upstreamVersion;
      changes.push({ section, name, from: currentVersion, to: upstreamVersion });
    }
  }
  return { manifest, changes };
}
