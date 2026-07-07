const LOCAL_TAILSCALE_PATH_PREFIX_PATTERN =
  /^(\/(?:main|staging|original|nightly|t3code(?:-[a-z0-9][a-z0-9-]*)?))(?:\/|$)/u;

export const DEFAULT_PUBLIC_PATH_PREFIX = "/t3code";

export type TailscaleServeUiRouteValidationIssue =
  | "empty"
  | "root"
  | "url"
  | "nested"
  | "query"
  | "hash"
  | "invalid-segment";

export type TailscaleServeUiRouteValidationResult =
  | {
      readonly valid: true;
      readonly route: string;
      readonly segment: string;
    }
  | {
      readonly valid: false;
      readonly issue: TailscaleServeUiRouteValidationIssue;
      readonly message: string;
    };

export interface TailscaleReservedServeRoutePolicy {
  readonly route: "/main" | "/original" | "/staging" | "/nightly";
  readonly expectedBranch: string;
  readonly expectedBranchPattern?: RegExp;
  readonly expectedWorktreeBasename: "t3code" | "original" | "staging" | "nightly-local";
  readonly expectedDescription: string;
}

export interface TailscaleServeRouteOwnerIdentity {
  readonly branch: string | null;
  readonly topLevelPath: string;
  readonly worktreeBasename: string;
}

export interface TailscaleReservedServeRouteConflict {
  readonly route: string;
  readonly expectedBranch: string;
  readonly expectedWorktreeBasename: string;
  readonly expectedDescription: string;
  readonly actualBranch: string | null;
  readonly actualWorktreePath: string;
  readonly actualWorktreeBasename: string;
  readonly message: string;
}

const TAILSCALE_SERVE_UI_ROUTE_SEGMENT_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

const TAILSCALE_RESERVED_SERVE_ROUTE_POLICIES: Record<
  TailscaleReservedServeRoutePolicy["route"],
  TailscaleReservedServeRoutePolicy
> = {
  "/main": {
    route: "/main",
    expectedBranch: "main",
    expectedWorktreeBasename: "t3code",
    expectedDescription: "the root main checkout on branch main",
  },
  "/original": {
    route: "/original",
    expectedBranch: "original",
    expectedWorktreeBasename: "original",
    expectedDescription: "the original branch/worktree",
  },
  "/staging": {
    route: "/staging",
    expectedBranch: "staging",
    expectedWorktreeBasename: "staging",
    expectedDescription: "the staging branch/worktree",
  },
  "/nightly": {
    route: "/nightly",
    expectedBranch: "dev/nightly-topic-stack-YYYYMMDD",
    expectedBranchPattern: /^dev\/nightly-topic-stack-[0-9]{8}$/u,
    expectedWorktreeBasename: "nightly-local",
    expectedDescription: "the nightly replay branch/worktree",
  },
};

export function normalizePublicPathSegment(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function validateTailscaleServeUiRoute(
  value: string | null | undefined,
): TailscaleServeUiRouteValidationResult {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return {
      valid: false,
      issue: "empty",
      message: "Enter a single path segment such as /qa.",
    };
  }
  if (trimmed === "/") {
    return {
      valid: false,
      issue: "root",
      message: "Tailscale HTTPS route cannot be the root path.",
    };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) {
    return {
      valid: false,
      issue: "url",
      message: "Enter only a path segment, not a full URL.",
    };
  }
  if (trimmed.includes("?")) {
    return {
      valid: false,
      issue: "query",
      message: "Tailscale HTTPS route cannot include a query string.",
    };
  }
  if (trimmed.includes("#")) {
    return {
      valid: false,
      issue: "hash",
      message: "Tailscale HTTPS route cannot include a fragment.",
    };
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/u, "");
  if (withoutLeadingSlash.length === 0) {
    return {
      valid: false,
      issue: "root",
      message: "Tailscale HTTPS route cannot be the root path.",
    };
  }
  if (withoutLeadingSlash.includes("/") || withoutLeadingSlash.includes("\\")) {
    return {
      valid: false,
      issue: "nested",
      message: "Enter a single path segment, not a nested path.",
    };
  }

  const segment = withoutLeadingSlash.toLowerCase();
  if (!TAILSCALE_SERVE_UI_ROUTE_SEGMENT_PATTERN.test(segment)) {
    return {
      valid: false,
      issue: "invalid-segment",
      message: "Use only letters, numbers, and hyphens.",
    };
  }

  return {
    valid: true,
    route: `/${segment}`,
    segment,
  };
}

export function normalizeTailscaleServeUiRoute(
  value: string | null | undefined,
): string | undefined {
  const result = validateTailscaleServeUiRoute(value);
  return result.valid ? result.route : undefined;
}

export function getTailscaleReservedServeRoutePolicy(
  route: string,
): TailscaleReservedServeRoutePolicy | null {
  return (
    TAILSCALE_RESERVED_SERVE_ROUTE_POLICIES[route as TailscaleReservedServeRoutePolicy["route"]] ??
    null
  );
}

export function checkTailscaleReservedServeRouteOwner(input: {
  readonly route: string;
  readonly identity: TailscaleServeRouteOwnerIdentity;
}): TailscaleReservedServeRouteConflict | null {
  const policy = getTailscaleReservedServeRoutePolicy(input.route);
  if (policy === null) {
    return null;
  }

  const branchMatches =
    input.identity.branch !== null &&
    (policy.expectedBranchPattern === undefined
      ? input.identity.branch === policy.expectedBranch
      : policy.expectedBranchPattern.test(input.identity.branch));
  const basenameMatches = input.identity.worktreeBasename === policy.expectedWorktreeBasename;
  const mainPathMatches =
    policy.route !== "/main" || !input.identity.topLevelPath.includes("/.worktrees/");

  if (branchMatches && basenameMatches && mainPathMatches) {
    return null;
  }

  const actualBranch = input.identity.branch ?? "detached HEAD";
  return {
    route: policy.route,
    expectedBranch: policy.expectedBranch,
    expectedWorktreeBasename: policy.expectedWorktreeBasename,
    expectedDescription: policy.expectedDescription,
    actualBranch: input.identity.branch,
    actualWorktreePath: input.identity.topLevelPath,
    actualWorktreeBasename: input.identity.worktreeBasename,
    message: `Route ${policy.route} is reserved for ${policy.expectedDescription}. This app is running from ${input.identity.topLevelPath} on ${actualBranch}.`,
  };
}

export function resolveWorkspacePublicPathPrefix(input: {
  readonly workspaceSlug?: string | null | undefined;
  readonly worktreeRole?: string | null | undefined;
  readonly devInstance?: string | null | undefined;
  readonly fallback?: string | null | undefined;
}): string {
  const slug =
    normalizePublicPathSegment(input.workspaceSlug) ??
    normalizePublicPathSegment(input.worktreeRole) ??
    normalizePublicPathSegment(input.devInstance);
  if (slug) {
    return `/${slug}`;
  }
  return normalizePublicPathPrefix(input.fallback) ?? DEFAULT_PUBLIC_PATH_PREFIX;
}

/**
 * Detects a local Tailscale path prefix from a URL pathname.
 * Supports canonical worktree paths (`/main`, `/staging`, `/original`,
 * `/nightly`), the default `/t3code` path, and legacy worktree instances at
 * `/t3code-<slug>`.
 */
export function readLocalPublicPathPrefixFromPathname(pathname: string): string | undefined {
  const match = pathname.match(LOCAL_TAILSCALE_PATH_PREFIX_PATTERN);
  return match?.[1];
}

export function normalizePublicPathPrefix(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") {
    return undefined;
  }

  const withoutHash = trimmed.split("#", 1)[0] ?? "";
  const withoutSearch = withoutHash.split("?", 1)[0] ?? "";
  const withoutLeadingSlash = withoutSearch.replace(/^\/+/u, "");
  const withoutTrailingSlash = withoutLeadingSlash.replace(/\/+$/u, "");
  return withoutTrailingSlash.length === 0 ? undefined : `/${withoutTrailingSlash}`;
}

export function joinPublicPathPrefix(
  publicPathPrefix: string | null | undefined,
  pathname: string,
): string {
  const normalizedPrefix = normalizePublicPathPrefix(publicPathPrefix);
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!normalizedPrefix) {
    return suffix;
  }
  if (suffix === normalizedPrefix || suffix.startsWith(`${normalizedPrefix}/`)) {
    return suffix;
  }
  return `${normalizedPrefix}${suffix}`;
}
