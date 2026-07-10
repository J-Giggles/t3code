// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Machine-local replay memory uses Node filesystem and hashing APIs.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const REPAIR_MEMORY_DIR = ".t3code-nightly-repair-memory";

interface RecordedRepairFile {
  readonly path: string;
  readonly state: "deleted" | "file";
  readonly contentBase64?: string;
  readonly mode?: number;
}

export interface RecordedNightlyRepairMemory {
  readonly schemaVersion: 1 | 2;
  readonly topicId: string;
  readonly commit: string;
  readonly conflictSignature: string;
  readonly conflictIndex?: ReadonlyArray<string>;
  readonly summary: string;
  readonly files: ReadonlyArray<RecordedRepairFile>;
  readonly createdAt: string;
}

export function isSafeRecordedRepairPath(path: string): boolean {
  if (path.length === 0 || NodePath.isAbsolute(path)) return false;
  return !path.split(/[\\/]/u).some((part) => part === "..");
}

export function isPathInRecordedRepairScope(
  path: string,
  repairPaths: ReadonlyArray<string>,
): boolean {
  if (!isSafeRecordedRepairPath(path)) return false;
  return repairPaths.some((repairPath) => {
    const normalized = repairPath.replace(/[\\/]+$/u, "");
    return (
      isSafeRecordedRepairPath(normalized) &&
      (path === normalized || path.startsWith(`${normalized}/`))
    );
  });
}

export function conflictIndexSignature(indexOutput: string): string {
  const canonicalIndex = canonicalConflictIndex(indexOutput).join("\n");
  return NodeCrypto.createHash("sha256").update(canonicalIndex).digest("hex");
}

function canonicalConflictIndex(indexOutput: string): ReadonlyArray<string> {
  return indexOutput
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .sort();
}

function safeCommitName(commit: string): string {
  return /^[0-9a-f]{7,64}$/iu.test(commit)
    ? commit.toLowerCase()
    : NodeCrypto.createHash("sha256").update(commit).digest("hex");
}

export function recordedRepairMemoryPath(
  repoFamilyRoot: string,
  commit: string,
  indexOutput: string,
): string {
  return NodePath.join(
    repoFamilyRoot,
    REPAIR_MEMORY_DIR,
    `${safeCommitName(commit)}-${conflictIndexSignature(indexOutput)}.json`,
  );
}

function parseRecordedRepairMemory(value: unknown): RecordedNightlyRepairMemory | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    ![1, 2].includes(Number(record.schemaVersion)) ||
    typeof record.topicId !== "string" ||
    typeof record.commit !== "string" ||
    typeof record.conflictSignature !== "string" ||
    typeof record.summary !== "string" ||
    typeof record.createdAt !== "string" ||
    !Array.isArray(record.files)
  ) {
    return undefined;
  }
  if (
    record.schemaVersion === 2 &&
    (!Array.isArray(record.conflictIndex) ||
      record.conflictIndex.length === 0 ||
      record.conflictIndex.some((line) => typeof line !== "string" || line.length === 0))
  ) {
    return undefined;
  }
  const files: Array<RecordedRepairFile> = [];
  for (const value of record.files) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const file = value as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      !isSafeRecordedRepairPath(file.path) ||
      !["deleted", "file"].includes(String(file.state))
    ) {
      return undefined;
    }
    if (file.state === "file" && typeof file.contentBase64 !== "string") return undefined;
    files.push({
      path: file.path,
      state: file.state as "deleted" | "file",
      ...(typeof file.contentBase64 === "string" ? { contentBase64: file.contentBase64 } : {}),
      ...(typeof file.mode === "number" ? { mode: file.mode } : {}),
    });
  }
  if (files.length === 0) return undefined;
  return {
    schemaVersion: record.schemaVersion as 1 | 2,
    topicId: record.topicId,
    commit: record.commit,
    conflictSignature: record.conflictSignature,
    ...(record.schemaVersion === 2
      ? { conflictIndex: [...(record.conflictIndex as ReadonlyArray<string>)].sort() }
      : {}),
    summary: record.summary,
    files,
    createdAt: record.createdAt,
  };
}

export function readRecordedRepairMemory(input: {
  readonly repoFamilyRoot: string;
  readonly topicId: string;
  readonly commit: string;
  readonly indexOutput: string;
}): RecordedNightlyRepairMemory | undefined {
  const path = recordedRepairMemoryPath(input.repoFamilyRoot, input.commit, input.indexOutput);
  const exactMemory = readMemoryFile(path);
  if (
    exactMemory?.topicId === input.topicId &&
    exactMemory.commit === input.commit &&
    exactMemory.conflictSignature === conflictIndexSignature(input.indexOutput)
  ) {
    return exactMemory;
  }

  const currentIndex = canonicalConflictIndex(input.indexOutput);
  const currentEntries = new Set(currentIndex);
  const currentPaths = new Set(
    currentIndex.flatMap((line) => {
      const tab = line.indexOf("\t");
      return tab === -1 ? [] : [line.slice(tab + 1)];
    }),
  );
  if (currentEntries.size === 0 || currentPaths.size === 0) return undefined;

  const memoryDir = NodePath.join(input.repoFamilyRoot, REPAIR_MEMORY_DIR);
  if (!NodeFS.existsSync(memoryDir)) return undefined;
  const prefix = `${safeCommitName(input.commit)}-`;
  const candidates = NodeFS.readdirSync(memoryDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => readMemoryFile(NodePath.join(memoryDir, name)))
    .filter(
      (memory): memory is RecordedNightlyRepairMemory =>
        memory?.schemaVersion === 2 &&
        memory.topicId === input.topicId &&
        memory.commit === input.commit &&
        memory.conflictIndex !== undefined &&
        currentIndex.every((line) => memory.conflictIndex!.includes(line)) &&
        [...currentPaths].every((currentPath) =>
          memory.files.some((file) => file.path === currentPath),
        ),
    )
    .sort((left, right) => left.conflictIndex!.length - right.conflictIndex!.length);
  const compatible = candidates[0];
  if (compatible === undefined) return undefined;
  return {
    ...compatible,
    conflictSignature: conflictIndexSignature(input.indexOutput),
    conflictIndex: currentIndex,
    files: compatible.files.filter((file) => currentPaths.has(file.path)),
  };
}

function readMemoryFile(path: string): RecordedNightlyRepairMemory | undefined {
  if (!NodeFS.existsSync(path)) return undefined;
  try {
    return parseRecordedRepairMemory(JSON.parse(NodeFS.readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

export function writeRecordedRepairMemory(input: {
  readonly repoFamilyRoot: string;
  readonly nightlyPath: string;
  readonly topicId: string;
  readonly commit: string;
  readonly indexOutput: string;
  readonly paths: ReadonlyArray<string>;
  readonly repairPaths: ReadonlyArray<string>;
  readonly summary: string;
  readonly now?: Date;
}): string {
  const paths = [...new Set(input.paths)].sort();
  if (
    paths.length === 0 ||
    paths.some((path) => !isPathInRecordedRepairScope(path, input.repairPaths))
  ) {
    throw new Error("Recorded repair paths must be non-empty and inside the topic repair scope.");
  }
  const files = paths.map((path): RecordedRepairFile => {
    const absolutePath = NodePath.join(input.nightlyPath, path);
    if (!NodeFS.existsSync(absolutePath)) return { path, state: "deleted" };
    const stat = NodeFS.statSync(absolutePath);
    if (!stat.isFile()) throw new Error(`Recorded repair path is not a file: ${path}`);
    return {
      path,
      state: "file",
      contentBase64: NodeFS.readFileSync(absolutePath).toString("base64"),
      mode: stat.mode & 0o777,
    };
  });
  const memory: RecordedNightlyRepairMemory = {
    schemaVersion: 2,
    topicId: input.topicId,
    commit: input.commit,
    conflictSignature: conflictIndexSignature(input.indexOutput),
    conflictIndex: canonicalConflictIndex(input.indexOutput),
    summary: input.summary,
    files,
    createdAt: (input.now ?? new Date()).toISOString(),
  };
  const path = recordedRepairMemoryPath(input.repoFamilyRoot, input.commit, input.indexOutput);
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  NodeFS.writeFileSync(temporaryPath, `${JSON.stringify(memory, undefined, 2)}\n`, { mode: 0o600 });
  NodeFS.renameSync(temporaryPath, path);
  return path;
}

export function restoreRecordedRepairMemory(
  nightlyPath: string,
  memory: RecordedNightlyRepairMemory,
  repairPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  for (const file of memory.files) {
    if (!isPathInRecordedRepairScope(file.path, repairPaths)) {
      throw new Error(`Recorded repair contains an out-of-scope path: ${file.path}`);
    }
    const absolutePath = NodePath.join(nightlyPath, file.path);
    if (file.state === "deleted") {
      NodeFS.rmSync(absolutePath, { force: true });
      continue;
    }
    NodeFS.mkdirSync(NodePath.dirname(absolutePath), { recursive: true });
    NodeFS.writeFileSync(absolutePath, Buffer.from(file.contentBase64!, "base64"));
    if (file.mode !== undefined) NodeFS.chmodSync(absolutePath, file.mode);
  }
  return memory.files.map((file) => file.path);
}
