import {
  type DesktopDevLaunchCollision,
  type DesktopDevLaunchRecord,
  type DesktopDevLaunchSetupInput,
  type PromptOverrides,
  type ProjectDevLaunchManifest,
  type ProjectDevLaunchProfile,
  ProjectDevLaunchManifest as ProjectDevLaunchManifestSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PROMPT_IDS, renderPromptTemplate } from "../../prompts.ts";

export const DEV_LAUNCH_MANIFEST_RELATIVE_PATH = ".t3code/dev-apps.json";

const decodeManifestJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ProjectDevLaunchManifestSchema),
);

export function normalizeDevLaunchSlug(value: string, fallback = "app"): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveProjectSlug(projectName: string): string {
  return normalizeDevLaunchSlug(projectName, "project");
}

export function resolveWorktreeSlug(input: {
  canonicalWorktreePath: string;
  branch: string | null;
}): string {
  const pathSegments = input.canonicalWorktreePath.split(/[/\\]/u);
  const basename = pathSegments.findLast((segment) => segment.length > 0) ?? "worktree";
  const branchSlug = input.branch ? normalizeDevLaunchSlug(input.branch, "") : "";
  if (branchSlug.startsWith("worktree-")) {
    return branchSlug;
  }
  return normalizeDevLaunchSlug(basename, "worktree");
}

export function resolveAppSegment(input: {
  profile: ProjectDevLaunchProfile;
  profileCount: number;
}): string {
  if (input.profileCount <= 1) {
    return "app";
  }
  return normalizeDevLaunchSlug(input.profile.appSegment ?? input.profile.id, "app");
}

export function joinDevLaunchPublicPath(input: {
  projectSlug: string;
  worktreeSlug: string;
  appSegment: string;
}): string {
  return `/${normalizeDevLaunchSlug(input.projectSlug, "project")}/${normalizeDevLaunchSlug(
    input.worktreeSlug,
    "worktree",
  )}/${normalizeDevLaunchSlug(input.appSegment, "app")}/`;
}

export function buildDevLaunchPublicUrl(input: {
  magicDnsName: string;
  publicPath: string;
}): string {
  const url = new URL(`https://${input.magicDnsName}`);
  url.pathname = `${input.publicPath.replace(/\/+$/u, "")}/`;
  return url.toString();
}

export function parseProjectDevLaunchManifest(
  raw: string,
): Effect.Effect<ProjectDevLaunchManifest, Schema.SchemaError> {
  return decodeManifestJson(raw);
}

export interface ProjectDevLaunchResolvedValues {
  readonly host: string;
  readonly port: number;
  readonly branch: string | null;
  readonly localHttpUrl: string;
  readonly publicOrigin: string;
  readonly publicBasePath: string;
  readonly publicBaseUrl: string;
  readonly serverPublicBasePath: string;
  readonly serverPublicBaseUrl: string;
  readonly projectSlug: string;
  readonly worktreeSlug: string;
  readonly appSegment: string;
}

export function renderDevLaunchTemplate(
  template: string,
  values: ProjectDevLaunchResolvedValues,
): string {
  return template
    .replaceAll("{{host}}", values.host)
    .replaceAll("{{port}}", String(values.port))
    .replaceAll("{{localHttpUrl}}", values.localHttpUrl)
    .replaceAll("{{publicOrigin}}", values.publicOrigin)
    .replaceAll("{{publicBasePath}}", values.publicBasePath)
    .replaceAll("{{publicBaseUrl}}", values.publicBaseUrl)
    .replaceAll("{{serverPublicBasePath}}", values.serverPublicBasePath)
    .replaceAll("{{serverPublicBaseUrl}}", values.serverPublicBaseUrl)
    .replaceAll("{{branch}}", values.branch ?? "")
    .replaceAll("{{projectSlug}}", values.projectSlug)
    .replaceAll("{{worktreeSlug}}", values.worktreeSlug)
    .replaceAll("{{appSegment}}", values.appSegment);
}

export function renderDevLaunchHealthCheckPath(
  template: string,
  values: ProjectDevLaunchResolvedValues,
): string {
  const rendered = renderDevLaunchTemplate(template, values).trim();
  if (!rendered) {
    return "/";
  }
  return rendered.startsWith("/") ? rendered : `/${rendered}`;
}

export function buildDevLaunchCollisionPrompt(input: {
  collision: DesktopDevLaunchCollision;
  projectName: string;
  promptOverrides?: PromptOverrides | undefined;
}): string {
  const reason =
    input.collision.type === "port-conflict"
      ? `The requested host port ${input.collision.requestedPort} is already in use by '${input.collision.blocking.profileName}' on ${input.collision.blocking.canonicalWorktreePath}.`
      : input.collision.type === "route-conflict"
        ? `Route ${input.collision.servePath} is already taken by ${input.collision.existingProxyUrl}; this launch expects ${input.collision.expectedProxyUrl}.`
        : `A dev app is already running from this worktree at ${input.collision.blocking.canonicalWorktreePath}.`;
  const blockingProfileName =
    input.collision.type === "route-conflict"
      ? "Tailscale Serve route"
      : input.collision.blocking.profileName;
  const blockingProfileId =
    input.collision.type === "route-conflict"
      ? input.collision.servePath
      : input.collision.blocking.profileId;
  const blockingPublicUrl =
    input.collision.type === "route-conflict"
      ? input.collision.existingProxyUrl
      : input.collision.blocking.publicUrl;

  return renderPromptTemplate(
    PROMPT_IDS.devLaunchCollision,
    {
      projectName: input.projectName,
      reason,
      blockingProfileName,
      blockingProfileId,
      blockingPublicUrl,
    },
    input.promptOverrides,
  );
}

export interface DevLaunchPromptOptions {
  readonly promptOverrides?: PromptOverrides | undefined;
}

export interface DevLaunchFailurePromptInput {
  readonly setup: DesktopDevLaunchSetupInput;
  readonly profile: ProjectDevLaunchProfile;
  readonly errorMessage: string;
  readonly remoteClientUrl?: string | null;
  readonly activeLaunches?: ReadonlyArray<DesktopDevLaunchRecord>;
  readonly failureKind?: string | null;
  readonly manifestSummary?: string | null;
  readonly promptOverrides?: PromptOverrides | undefined;
}

function formatFailureValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "not available";
  }
  return String(value);
}

export function buildDevLaunchFailurePrompt(input: DevLaunchFailurePromptInput): string {
  const workspaceRoot = input.setup.worktreePath ?? input.setup.projectRoot;
  const activeLaunches = input.activeLaunches ?? [];
  const activeLines =
    activeLaunches.length === 0
      ? ["- none"]
      : activeLaunches.map(
          (launch) =>
            `- ${launch.profileName} (${launch.profileId}) port ${launch.localPort}: ${launch.publicUrl}`,
        );

  return renderPromptTemplate(
    PROMPT_IDS.devLaunchFailure,
    {
      projectName: input.setup.projectName,
      projectRoot: input.setup.projectRoot,
      workspaceRoot,
      branch: input.setup.branch ?? "unknown",
      remoteClientUrl: formatFailureValue(input.remoteClientUrl),
      profileId: input.profile.id,
      profileName: input.profile.name,
      profileCommand: input.profile.command,
      profileCwd: input.profile.cwd,
      profileHost: input.profile.host,
      profilePort: input.profile.port,
      profileHealthCheckPath: input.profile.healthCheckPath,
      failureKind: formatFailureValue(input.failureKind),
      errorMessage: input.errorMessage,
      activeLaunches: activeLines.join("\n"),
      manifestSummary: formatFailureValue(input.manifestSummary),
    },
    input.promptOverrides,
  );
}

export function buildDevLaunchSetupPrompt(
  input: DesktopDevLaunchSetupInput,
  options?: DevLaunchPromptOptions,
): string {
  const workspaceRoot = input.worktreePath ?? input.projectRoot;
  return renderPromptTemplate(
    PROMPT_IDS.devLaunchSetup,
    {
      projectName: input.projectName,
      projectRoot: input.projectRoot,
      workspaceRoot,
      branch: input.branch ?? "unknown",
      manifestRelativePath: DEV_LAUNCH_MANIFEST_RELATIVE_PATH,
    },
    options?.promptOverrides,
  );
}
