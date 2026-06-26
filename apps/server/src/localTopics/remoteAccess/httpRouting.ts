import {
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
} from "@t3tools/shared/publicPath";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);
const PUBLIC_PATH_PREFIX_META_NAME = "t3code-public-path-prefix";

export function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  return LOOPBACK_HOSTNAMES.has(normalizedHostname);
}

export function resolveDevRedirectUrl(devUrl: URL, requestUrl: URL): string {
  const redirectUrl = resolveDevRequestUrl(devUrl, requestUrl);
  return redirectUrl.toString();
}

export function resolveDevRequestUrl(devUrl: URL, requestUrl: URL): URL {
  const redirectUrl = new URL(devUrl.toString());
  const devBasePath = normalizePublicPathPrefix(devUrl.pathname);
  redirectUrl.pathname = devBasePath
    ? rewriteRootRelativePublicPath(requestUrl.pathname, devBasePath)
    : requestUrl.pathname;
  redirectUrl.search = requestUrl.search;
  redirectUrl.hash = requestUrl.hash;
  return redirectUrl;
}

function rewriteRootRelativePublicPath(rootPath: string, publicPathPrefix: string): string {
  if (rootPath === publicPathPrefix || rootPath.startsWith(`${publicPathPrefix}/`)) {
    return rootPath;
  }

  const stalePublicPathPrefix = readLocalPublicPathPrefixFromPathname(rootPath);
  if (stalePublicPathPrefix) {
    const suffix =
      rootPath === stalePublicPathPrefix ? "/" : rootPath.slice(stalePublicPathPrefix.length);
    return suffix === "/" ? publicPathPrefix : `${publicPathPrefix}${suffix}`;
  }

  return `${publicPathPrefix}${rootPath}`;
}

function prefixRootRelativeHtmlAttribute(
  html: string,
  attribute: "href" | "src",
  publicPathPrefix: string,
): string {
  return html.replace(
    new RegExp(`\\b${attribute}=("|')/(?!/)([^"']*)\\1`, "gi"),
    (match, quote: string, path: string) => {
      const rewritten = rewriteRootRelativePublicPath(`/${path}`, publicPathPrefix);
      return rewritten === `/${path}` ? match : `${attribute}=${quote}${rewritten}${quote}`;
    },
  );
}

export function rewriteHtmlForPublicPathPrefix(html: string, publicPathPrefix: string): string {
  const normalizedPrefix = normalizePublicPathPrefix(publicPathPrefix);
  if (!normalizedPrefix) {
    return html;
  }

  const metaTag = `<meta name="${PUBLIC_PATH_PREFIX_META_NAME}" content="${normalizedPrefix}" />`;
  let rewritten = html.includes(`name="${PUBLIC_PATH_PREFIX_META_NAME}"`)
    ? html
    : html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${metaTag}`);

  rewritten = prefixRootRelativeHtmlAttribute(rewritten, "href", normalizedPrefix);
  rewritten = prefixRootRelativeHtmlAttribute(rewritten, "src", normalizedPrefix);

  return rewritten;
}

export function rewriteCssForPublicPathPrefix(css: string, publicPathPrefix: string): string {
  const normalizedPrefix = normalizePublicPathPrefix(publicPathPrefix);
  if (!normalizedPrefix) {
    return css;
  }

  return css.replace(
    /url\(\s*(?:(["'])\/(?!\/)([^"')]+)\1|\/(?!\/)([^"')\s]+))\s*\)/gi,
    (match, quote: string | undefined, quotedPath: string | undefined, unquotedPath: string) => {
      const path = quotedPath ?? unquotedPath;
      if (!path) {
        return match;
      }
      const rewritten = rewriteRootRelativePublicPath(`/${path}`, normalizedPrefix);
      return quote ? `url(${quote}${rewritten}${quote})` : `url(${rewritten})`;
    },
  );
}

export function maybeRewriteIndexHtml(
  html: Uint8Array,
  publicPathPrefix: string | undefined,
): Uint8Array {
  if (!publicPathPrefix) {
    return html;
  }

  const rewritten = rewriteHtmlForPublicPathPrefix(
    new TextDecoder().decode(html),
    publicPathPrefix,
  );
  return new TextEncoder().encode(rewritten);
}

export function maybeRewriteCss(css: Uint8Array, publicPathPrefix: string | undefined): Uint8Array {
  if (!publicPathPrefix) {
    return css;
  }

  const rewritten = rewriteCssForPublicPathPrefix(new TextDecoder().decode(css), publicPathPrefix);
  return new TextEncoder().encode(rewritten);
}

export function stripPublicPathPrefixFromUrl(url: URL, publicPathPrefix: string | undefined): URL {
  if (!publicPathPrefix) {
    return url;
  }

  if (url.pathname !== publicPathPrefix && !url.pathname.startsWith(`${publicPathPrefix}/`)) {
    return url;
  }

  const nextUrl = new URL(url.toString());
  nextUrl.pathname =
    url.pathname === publicPathPrefix ? "/" : url.pathname.slice(publicPathPrefix.length);
  const stalePublicPathPrefix = readLocalPublicPathPrefixFromPathname(nextUrl.pathname);
  if (stalePublicPathPrefix) {
    nextUrl.pathname =
      nextUrl.pathname === stalePublicPathPrefix
        ? "/"
        : nextUrl.pathname.slice(stalePublicPathPrefix.length);
  }
  return nextUrl;
}
