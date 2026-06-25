// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";

function sha256Prefix(input: string): string {
  return NodeCrypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function encodeSecretRef(secretRef: string): string {
  return encodeURIComponent(secretRef.trim());
}

export function projectAgentProjectKeyFromSource(input: {
  readonly source: string;
  readonly sourceKind: "repository" | "path";
}): string {
  const prefix = input.sourceKind === "repository" ? "repo" : "path";
  return `${prefix}-${sha256Prefix(input.source)}`;
}

export function projectAgentSecretStorageKey(input: {
  readonly projectKey: string;
  readonly secretRef: string;
}): string {
  return `project-agent:${input.projectKey}:${encodeSecretRef(input.secretRef)}`;
}
