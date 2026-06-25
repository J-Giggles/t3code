import type { DesktopAppBranding } from "@t3tools/contracts";
import { formatAppDisplayName } from "./branding.logic";

function readTrimmedEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function basenameFromPath(path: string | undefined): string | null {
  const trimmed = readTrimmedEnvValue(path);
  if (trimmed === null) {
    return null;
  }
  const segments = trimmed.split(/[\\/]+/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? null;
}

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding?.() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();
const devWorktreeName =
  readTrimmedEnvValue(import.meta.env.VITE_DEV_WORKTREE_NAME) ??
  basenameFromPath(import.meta.env.VITE_T3_WORKTREE_PATH) ??
  readTrimmedEnvValue(import.meta.env.VITE_T3_WORKTREE_ROLE) ??
  readTrimmedEnvValue(import.meta.env.VITE_T3_DEV_INSTANCE);
const devBranchName =
  readTrimmedEnvValue(import.meta.env.VITE_DEV_BRANCH_NAME) ??
  readTrimmedEnvValue(import.meta.env.VITE_T3_GIT_BRANCH);

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL =
  HOSTED_APP_CHANNEL === "nightly" ? "Nightly" : HOSTED_APP_CHANNEL === "latest" ? "Latest" : null;
export const DEV_APP_STAGE_LABEL =
  import.meta.env.DEV && devWorktreeName && devBranchName
    ? `${devWorktreeName} / ${devBranchName}`
    : import.meta.env.DEV && devWorktreeName
      ? devWorktreeName
      : import.meta.env.DEV && devBranchName
        ? devBranchName
        : null;
export const APP_BASE_NAME = injectedDesktopAppBranding?.baseName ?? "T3 Code";
export const APP_STAGE_LABEL =
  DEV_APP_STAGE_LABEL ??
  injectedDesktopAppBranding?.stageLabel ??
  HOSTED_APP_CHANNEL_LABEL ??
  (import.meta.env.DEV ? "Dev" : "Alpha");
export const APP_DISPLAY_NAME =
  DEV_APP_STAGE_LABEL !== null
    ? formatAppDisplayName({ baseName: APP_BASE_NAME, stageLabel: DEV_APP_STAGE_LABEL })
    : (injectedDesktopAppBranding?.displayName ??
      formatAppDisplayName({ baseName: APP_BASE_NAME, stageLabel: APP_STAGE_LABEL }));
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
