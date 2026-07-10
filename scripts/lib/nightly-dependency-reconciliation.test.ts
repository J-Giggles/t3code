import { describe, expect, it } from "vitest";
import { reconcileUpstreamExactDependencyVersions } from "./nightly-dependency-reconciliation.ts";

describe("nightly dependency reconciliation", () => {
  it("preserves local additions while restoring downgraded upstream exact pins", () => {
    const result = reconcileUpstreamExactDependencyVersions(
      {
        devDependencies: {
          "electron-builder": "26.8.1",
          playwright: "1.60.0",
          vite: "catalog:",
        },
      },
      {
        devDependencies: {
          "electron-builder": "26.15.6",
          vite: "catalog:",
        },
      },
    );

    expect(result.manifest).toEqual({
      devDependencies: {
        "electron-builder": "26.15.6",
        playwright: "1.60.0",
        vite: "catalog:",
      },
    });
    expect(result.changes).toEqual([
      {
        section: "devDependencies",
        name: "electron-builder",
        from: "26.8.1",
        to: "26.15.6",
      },
    ]);
  });

  it("does not rewrite ranges, catalog entries, or newer local pins", () => {
    const result = reconcileUpstreamExactDependencyVersions(
      {
        dependencies: { exact: "3.0.0", range: "^1.0.0", catalog: "catalog:" },
      },
      {
        dependencies: { exact: "2.0.0", range: "^2.0.0", catalog: "2.0.0" },
      },
    );
    expect(result.changes).toEqual([]);
  });
});
