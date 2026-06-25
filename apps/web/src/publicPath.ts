import {
  joinPublicPathPrefix,
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
} from "@t3tools/shared/publicPath";

const PUBLIC_PATH_PREFIX_META_SELECTOR = 'meta[name="t3code-public-path-prefix"]';

interface PublicPathEnv {
  readonly VITE_T3CODE_PUBLIC_ORIGIN?: string | undefined;
  readonly VITE_T3CODE_PUBLIC_BASE_PATH?: string | undefined;
  readonly VITE_T3CODE_PUBLIC_BASE_URL?: string | undefined;
}

export function readPublicPathPrefixFromPathname(pathname: string): string | undefined {
  return readLocalPublicPathPrefixFromPathname(pathname);
}

export function readConfiguredPublicPathPrefix(
  env: PublicPathEnv = import.meta.env as PublicPathEnv,
): string | undefined {
  return normalizePublicPathPrefix(env.VITE_T3CODE_PUBLIC_BASE_PATH);
}

export function readConfiguredPublicOrigin(
  env: PublicPathEnv = import.meta.env as PublicPathEnv,
): string | undefined {
  const trimmed = env.VITE_T3CODE_PUBLIC_ORIGIN?.trim();
  return trimmed ? trimmed.replace(/\/+$/u, "") : undefined;
}

export function readConfiguredPublicBaseUrl(
  env: PublicPathEnv = import.meta.env as PublicPathEnv,
): string | undefined {
  const trimmed = env.VITE_T3CODE_PUBLIC_BASE_URL?.trim();
  return trimmed ? trimmed : undefined;
}

function readPublicPathPrefixFromLocation(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const pathname =
    typeof window.location.pathname === "string"
      ? window.location.pathname
      : new URL(window.location.href ?? window.location.origin).pathname;
  return readPublicPathPrefixFromPathname(pathname);
}

export function readBrowserPublicPathPrefix(): string | undefined {
  const fromEnv = readConfiguredPublicPathPrefix();
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  if (typeof document === "undefined") {
    return readPublicPathPrefixFromLocation();
  }

  const meta = document.querySelector?.(PUBLIC_PATH_PREFIX_META_SELECTOR);
  const fromMeta = normalizePublicPathPrefix(meta?.getAttribute("content"));
  if (fromMeta !== undefined) {
    return fromMeta;
  }

  return readPublicPathPrefixFromLocation();
}

export function resolveBrowserPublicPath(pathname: string): string {
  return joinPublicPathPrefix(readBrowserPublicPathPrefix(), pathname);
}

export function resolveBrowserPublicBaseUrl(): string {
  const configuredBaseUrl = readConfiguredPublicBaseUrl();
  if (configuredBaseUrl !== undefined) {
    const baseUrl = new URL(configuredBaseUrl);
    const normalizedPathname = normalizePublicPathPrefix(baseUrl.pathname);
    baseUrl.pathname = normalizedPathname ? `${normalizedPathname}/` : "/";
    return baseUrl.toString();
  }

  const baseUrl = new URL(readConfiguredPublicOrigin() ?? window.location.origin);
  baseUrl.pathname = resolveBrowserPublicPath("/");
  return baseUrl.toString();
}
