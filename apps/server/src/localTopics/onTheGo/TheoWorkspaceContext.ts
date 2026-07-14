// @effect-diagnostics nodeBuiltinImport:off - Workspace evidence is a bounded, read-only adapter over Node's file APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { redactTheoEvidence } from "./TheoContext.ts";

export interface TheoWorkspaceFile {
  readonly path: string;
  readonly version: string;
  readonly text: string;
}

export interface TheoWorkspaceContextSource {
  readonly source: "project-workspace";
  readonly reference: string;
  readonly sourceVersion: string;
  readonly excerpt: string;
  readonly allowedProviderIds: ReadonlyArray<string>;
}

const WORKSPACE_CUE = /\b(workspace|project|file|readme|documentation|docs|package|config)\b/i;
const SAFE_TEXT_FILE =
  /(?:^|\/)(?:AGENTS\.md|README(?:\.[^/]*)?|package\.json|[^/]+\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|mjs|cjs|css|scss|sql|sh|py|rs|go|java|kt|swift))$/i;
const ROOT_CANDIDATES = ["AGENTS.md", "README.md", "package.json"] as const;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

export const shouldReadTheoWorkspace = (utterance: string) => WORKSPACE_CUE.test(utterance);

const meaningfulTerms = (utterance: string) =>
  Array.from(
    new Set(
      utterance
        .toLocaleLowerCase()
        .match(/[a-z0-9][a-z0-9_-]{3,}/g)
        ?.filter(
          (term) =>
            ![
              "context",
              "documentation",
              "fetch",
              "file",
              "from",
              "project",
              "readme",
              "that",
              "theo",
              "this",
              "workspace",
            ].includes(term),
        ) ?? [],
    ),
  ).slice(0, 10);

export const buildTheoWorkspaceContext = (input: {
  readonly files: ReadonlyArray<TheoWorkspaceFile>;
  readonly utterance: string;
}) => {
  if (!shouldReadTheoWorkspace(input.utterance)) return [];
  const terms = meaningfulTerms(input.utterance);
  return input.files
    .filter((file) => SAFE_TEXT_FILE.test(file.path))
    .map((file) => {
      const searchable = `${file.path}\n${file.text}`.toLocaleLowerCase();
      const termScore = terms.reduce(
        (score, term) => score + (searchable.includes(term) ? 3 : 0),
        0,
      );
      const baseline = /(?:^|\/)(?:AGENTS\.md|README\.md|package\.json)$/i.test(file.path) ? 1 : 0;
      return { file, score: termScore + baseline };
    })
    .filter((candidate) => candidate.score > 0)
    .toSorted(
      (left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path),
    )
    .slice(0, 3)
    .map(
      ({ file }): TheoWorkspaceContextSource => ({
        source: "project-workspace",
        reference: file.path,
        sourceVersion: file.version,
        excerpt: redactTheoEvidence(`Workspace file: ${file.path}\n${file.text}`).slice(0, 6_000),
        allowedProviderIds: ["*"],
      }),
    );
};

const explicitPaths = (utterance: string) =>
  utterance
    .match(
      /(?:^|\s)((?:apps|packages|src|test|tests|docs)\/[a-z0-9_./@-]+\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|mjs|cjs|css|scss|sql|sh|py|rs|go|java|kt|swift))/giu,
    )
    ?.map((match) => match.trim()) ?? [];

const listCandidatePaths = async (root: string, utterance: string) => {
  const candidates = new Set<string>(ROOT_CANDIDATES);
  for (const explicitPath of explicitPaths(utterance)) candidates.add(explicitPath);
  for (const directory of ["docs", ".github"]) {
    try {
      const entries = await NodeFSP.readdir(NodePath.join(root, directory), {
        withFileTypes: true,
      });
      for (const entry of entries.slice(0, 80)) {
        if (entry.isFile()) candidates.add(NodePath.join(directory, entry.name));
      }
    } catch {
      // Optional documentation directory.
    }
  }
  const terms = meaningfulTerms(utterance);
  const queue = ["apps", "packages", "src"];
  let inspected = 0;
  while (queue.length > 0 && inspected < 2_000 && candidates.size < 40) {
    const directory = queue.shift()!;
    try {
      const entries = await NodeFSP.readdir(NodePath.join(root, directory), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        inspected += 1;
        if (inspected >= 2_000 || candidates.size >= 40) break;
        const relativePath = NodePath.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (
            !IGNORED_DIRECTORIES.has(entry.name) &&
            relativePath.split(NodePath.sep).length <= 7
          ) {
            queue.push(relativePath);
          }
          continue;
        }
        if (
          entry.isFile() &&
          SAFE_TEXT_FILE.test(relativePath) &&
          terms.some((term) => relativePath.toLocaleLowerCase().includes(term))
        ) {
          candidates.add(relativePath);
        }
      }
    } catch {
      // Optional source directory.
    }
  }
  return [...candidates];
};

export const readTheoWorkspaceFiles = async (
  root: string,
  utterance = "",
): Promise<ReadonlyArray<TheoWorkspaceFile>> => {
  const rootRealPath = await NodeFSP.realpath(root);
  const files = new Array<TheoWorkspaceFile>();
  for (const relativePath of await listCandidatePaths(rootRealPath, utterance)) {
    if (!SAFE_TEXT_FILE.test(relativePath)) continue;
    const candidate = NodePath.resolve(rootRealPath, relativePath);
    const relative = NodePath.relative(rootRealPath, candidate);
    if (!relative || relative.startsWith("..") || NodePath.isAbsolute(relative)) continue;
    try {
      const linkStat = await NodeFSP.lstat(candidate);
      if (!linkStat.isFile() || linkStat.isSymbolicLink() || linkStat.size > 256_000) continue;
      const realPath = await NodeFSP.realpath(candidate);
      const realRelative = NodePath.relative(rootRealPath, realPath);
      if (!realRelative || realRelative.startsWith("..") || NodePath.isAbsolute(realRelative))
        continue;
      files.push({
        path: realRelative.split(NodePath.sep).join("/"),
        version: `${Math.trunc(linkStat.mtimeMs)}:${linkStat.size}`,
        text: await NodeFSP.readFile(realPath, "utf8"),
      });
    } catch {
      // A missing, unreadable, or concurrently replaced file is unavailable evidence.
    }
  }
  return files;
};
