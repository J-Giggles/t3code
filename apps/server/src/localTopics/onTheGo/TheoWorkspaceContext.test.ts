import { describe, expect, it } from "vite-plus/test";

import { buildTheoWorkspaceContext } from "./TheoWorkspaceContext.ts";

describe("Theo project-workspace context", () => {
  it("OTG-UT-010: reads bounded relevant documentation and source evidence while redacting secrets", () => {
    const sources = buildTheoWorkspaceContext({
      utterance: "Fetch authentication context from the project documentation and src/auth.ts",
      files: [
        {
          path: "README.md",
          version: "1",
          text: "Authentication uses device sessions. API_KEY=do-not-speak",
        },
        { path: "docs/auth.md", version: "2", text: "Authentication failures fail closed." },
        { path: "src/auth.ts", version: "3", text: "export const bypass = true" },
        { path: "docs/colors.md", version: "4", text: "The border is blue." },
      ],
    });
    expect(sources.map((source) => source.reference)).toEqual(
      expect.arrayContaining(["README.md", "docs/auth.md", "src/auth.ts"]),
    );
    const readme = sources.find((source) => source.reference === "README.md");
    expect(readme?.excerpt).toContain("API_KEY: [redacted]");
    expect(readme?.excerpt).not.toContain("do-not-speak");
    expect(sources.some((source) => source.reference === "docs/colors.md")).toBe(false);
  });
});
