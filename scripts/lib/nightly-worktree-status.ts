const INTERNAL_NIGHTLY_ARTIFACT_DIRS = [
  ".t3code-nightly-runs",
  ".t3code-nightly-agent-runs",
  "apps/desktop/playwright-report",
  "apps/desktop/test-results",
  "apps/web/playwright-report",
] as const;

export function isInternalNightlyArtifactPath(path: string): boolean {
  return INTERNAL_NIGHTLY_ARTIFACT_DIRS.some(
    (directory) => path === directory || path.startsWith(`${directory}/`),
  );
}

export function hasMaterialPorcelainChanges(statusOutput: string): boolean {
  return statusOutput.split(/\r?\n/u).some((line) => {
    if (line.trim().length === 0 || line.startsWith("## ")) return false;
    const path = line.length > 3 ? line.slice(3) : line;
    return !isInternalNightlyArtifactPath(path);
  });
}
