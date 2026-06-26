import Mime from "@effect/platform-node/Mime";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import { decodeOtlpTraceRecords } from "@t3tools/shared/observability";
import {
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
} from "@t3tools/shared/publicPath";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { cast } from "effect/Function";
import {
  HttpBody,
  HttpClient,
  HttpClientResponse,
  HttpClientRequest,
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
  HttpServerRespondable,
} from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { OtlpTracer } from "effect/unstable/observability";

import * as ServerConfig from "./config.ts";
import {
  ASSET_ROUTE_PREFIX,
  FALLBACK_PROJECT_FAVICON_SVG,
  resolveAsset,
} from "./assets/AssetAccess.ts";
import * as BrowserTraceCollector from "./observability/BrowserTraceCollector.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { traceRelayRequest } from "./cloud/traceRelayRequest.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentScopeRequired,
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
} from "./auth/http.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import { browserApiCorsAllowedHeaders, browserApiCorsAllowedMethods } from "./httpCors.ts";

const OTLP_TRACES_PROXY_PATH = "/api/observability/v1/traces";
const OTLP_LOGS_PROXY_PATH = "/api/observability/v1/logs";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);
const DESKTOP_RENDERER_ORIGINS = ["t3code://app", "t3code-dev://app"];
const PUBLIC_PATH_PREFIX_META_NAME = "t3code-public-path-prefix";

export const browserApiCorsLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const devOrigin = config.devUrl?.origin;
    // Dev uses credentialed requests from Vite or the Electron custom origin, so both must be
    // explicit. Packaged desktop omits credentials and uses Effect's default wildcard origin.
    return HttpRouter.cors({
      ...(devOrigin
        ? { allowedOrigins: [devOrigin, ...DESKTOP_RENDERER_ORIGINS], credentials: true }
        : {}),
      allowedMethods: browserApiCorsAllowedMethods,
      allowedHeaders: browserApiCorsAllowedHeaders,
      maxAge: 600,
    });
  }),
);

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

function resolveDevRequestUrl(devUrl: URL, requestUrl: URL): URL {
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

function maybeRewriteIndexHtml(html: Uint8Array, publicPathPrefix: string | undefined): Uint8Array {
  if (!publicPathPrefix) {
    return html;
  }

  const rewritten = rewriteHtmlForPublicPathPrefix(
    new TextDecoder().decode(html),
    publicPathPrefix,
  );
  return new TextEncoder().encode(rewritten);
}

function maybeRewriteCss(css: Uint8Array, publicPathPrefix: string | undefined): Uint8Array {
  if (!publicPathPrefix) {
    return css;
  }

  const rewritten = rewriteCssForPublicPathPrefix(new TextDecoder().decode(css), publicPathPrefix);
  return new TextEncoder().encode(rewritten);
}

const proxyDevRequest = Effect.fn("http.proxyDevRequest")(function* (devUrl: URL, requestUrl: URL) {
  const httpClient = yield* HttpClient.HttpClient;
  const targetUrl = resolveDevRequestUrl(devUrl, requestUrl);
  const response = yield* httpClient.execute(HttpClientRequest.get(targetUrl));
  return HttpServerResponse.fromClientResponse(response);
});

function stripPublicPathPrefixFromUrl(url: URL, publicPathPrefix: string | undefined): URL {
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

const authenticateRawRouteWithScope = (
  scope: typeof AuthOrchestrationReadScope | typeof AuthOrchestrationOperateScope,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(EnvironmentAuth.serverAuthCredentialReason(error)),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
        failEnvironmentInternal("internal_error", error),
      ),
    );
    if (!session.scopes.includes(scope)) {
      return yield* failEnvironmentScopeRequired(scope);
    }
  });

export const serverEnvironmentHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "metadata",
  Effect.fnUntraced(function* (handlers) {
    const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
    return handlers.handle(
      "descriptor",
      Effect.fn("environment.metadata.descriptor")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        return yield* serverEnvironment.getDescriptor;
      }, traceRelayRequest),
    );
  }),
);

class DecodeOtlpTraceRecordsError extends Data.TaggedError("DecodeOtlpTraceRecordsError")<{
  readonly cause: unknown;
  readonly bodyJson: OtlpTracer.TraceData;
}> {}

const makeOtlpTracesProxyRouteLayer = (path: `/${string}`) =>
  HttpRouter.add(
    "POST",
    path,
    Effect.gen(function* () {
      yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const config = yield* ServerConfig.ServerConfig;
      const otlpTracesUrl = config.otlpTracesUrl;
      const browserTraceCollector = yield* BrowserTraceCollector.BrowserTraceCollector;
      const httpClient = yield* HttpClient.HttpClient;
      const bodyJson = cast<unknown, OtlpTracer.TraceData>(yield* request.json);

      yield* Effect.try({
        try: () => decodeOtlpTraceRecords(bodyJson),
        catch: (cause) => new DecodeOtlpTraceRecordsError({ cause, bodyJson }),
      }).pipe(
        Effect.flatMap((records) => browserTraceCollector.record(records)),
        Effect.catch((cause) =>
          Effect.logWarning("Failed to decode browser OTLP traces", {
            cause,
            bodyJson,
          }),
        ),
      );

      if (otlpTracesUrl === undefined) {
        return HttpServerResponse.empty({ status: 204 });
      }

      return yield* httpClient
        .post(otlpTracesUrl, {
          body: HttpBody.jsonUnsafe(bodyJson),
        })
        .pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.as(HttpServerResponse.empty({ status: 204 })),
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to export browser OTLP traces", {
              cause,
              otlpTracesUrl,
            }),
          ),
          Effect.orElseSucceed(() =>
            HttpServerResponse.text("Trace export failed.", { status: 502 }),
          ),
        );
    }).pipe(
      Effect.catchTags({
        EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
        EnvironmentInternalError: HttpServerRespondable.toResponse,
        EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
      }),
    ),
  );

export const otlpTracesProxyRouteLayer = makeOtlpTracesProxyRouteLayer(OTLP_TRACES_PROXY_PATH);

export const makePublicPathOtlpTracesProxyRouteLayer = (publicPathPrefix: string) =>
  makeOtlpTracesProxyRouteLayer(`${publicPathPrefix}${OTLP_TRACES_PROXY_PATH}` as `/${string}`);

const makeOtlpLogsProxyRouteLayer = (path: `/${string}`) =>
  HttpRouter.add(
    "POST",
    path,
    Effect.gen(function* () {
      yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const config = yield* ServerConfig.ServerConfig;
      const otlpLogsUrl = config.otlpLogsUrl;
      const httpClient = yield* HttpClient.HttpClient;
      const bodyJson = yield* request.json;

      if (otlpLogsUrl === undefined) {
        return HttpServerResponse.empty({ status: 204 });
      }

      return yield* httpClient
        .post(otlpLogsUrl, {
          body: HttpBody.jsonUnsafe(bodyJson),
        })
        .pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.as(HttpServerResponse.empty({ status: 204 })),
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to export browser OTLP logs", {
              cause,
              otlpLogsUrl,
            }),
          ),
          Effect.orElseSucceed(() =>
            HttpServerResponse.text("Log export failed.", { status: 502 }),
          ),
        );
    }).pipe(
      Effect.catchTags({
        EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
        EnvironmentInternalError: HttpServerRespondable.toResponse,
        EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
      }),
    ),
  );

export const otlpLogsProxyRouteLayer = makeOtlpLogsProxyRouteLayer(OTLP_LOGS_PROXY_PATH);

export const makePublicPathOtlpLogsProxyRouteLayer = (publicPathPrefix: string) =>
  makeOtlpLogsProxyRouteLayer(`${publicPathPrefix}${OTLP_LOGS_PROXY_PATH}` as `/${string}`);

const makeAssetRouteLayer = (routePrefix: `/${string}`) =>
  HttpRouter.add(
    "GET",
    `${routePrefix}/*`,
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = HttpServerRequest.toURL(request);
      if (Option.isNone(url)) {
        return HttpServerResponse.text("Bad Request", { status: 400 });
      }

      const suffix = url.value.pathname.slice(`${routePrefix}/`.length);
      const separatorIndex = suffix.indexOf("/");
      if (separatorIndex <= 0) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }

      const asset = yield* resolveAsset(
        suffix.slice(0, separatorIndex),
        suffix.slice(separatorIndex + 1),
      );
      if (!asset) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }
      if (asset.kind === "project-favicon-fallback") {
        return HttpServerResponse.text(FALLBACK_PROJECT_FAVICON_SVG, {
          status: 200,
          contentType: "image/svg+xml",
          headers: {
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      return yield* HttpServerResponse.file(asset.path, {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      }).pipe(
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Internal Server Error", { status: 500 }),
        ),
      );
    }),
  );

export const assetRouteLayer = makeAssetRouteLayer(ASSET_ROUTE_PREFIX);

export const makePublicPathAssetRouteLayer = (publicPathPrefix: string) =>
  makeAssetRouteLayer(`${publicPathPrefix}${ASSET_ROUTE_PREFIX}` as `/${string}`);

export const staticAndDevRouteLayer = HttpRouter.add(
  "GET",
  "*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);

    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig.ServerConfig;
    const publicPathPrefix = config.tailscaleServePath;
    const requestUrl = url.value;
    const effectiveUrl = stripPublicPathPrefixFromUrl(requestUrl, publicPathPrefix);
    if (config.devUrl && isLoopbackHostname(effectiveUrl.hostname)) {
      return HttpServerResponse.redirect(resolveDevRedirectUrl(config.devUrl, requestUrl), {
        status: 302,
      });
    }
    if (config.devUrl) {
      return yield* proxyDevRequest(config.devUrl, requestUrl).pipe(
        Effect.catch(() =>
          Effect.logWarning("Failed to proxy request to Vite dev server", {
            devUrl: config.devUrl?.toString(),
            requestPath: requestUrl.pathname,
          }).pipe(Effect.as(HttpServerResponse.text("Dev server unavailable.", { status: 502 }))),
        ),
      );
    }

    const staticDir =
      config.staticDir ?? (config.devUrl ? yield* ServerConfig.resolveStaticDir() : undefined);
    if (!staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staticRoot = path.resolve(staticDir);
    const staticRequestPath = effectiveUrl.pathname === "/" ? "/index.html" : effectiveUrl.pathname;
    const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
    const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
    const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
    const hasPathTraversalSegment = staticRelativePath.startsWith("..");
    if (
      staticRelativePath.length === 0 ||
      hasRawLeadingParentSegment ||
      hasPathTraversalSegment ||
      staticRelativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const isWithinStaticRoot = (candidate: string) =>
      candidate === staticRoot ||
      candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);

    let filePath = path.resolve(staticRoot, staticRelativePath);
    if (!isWithinStaticRoot(filePath)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const ext = path.extname(filePath);
    if (!ext) {
      filePath = path.resolve(filePath, "index.html");
      if (!isWithinStaticRoot(filePath)) {
        return HttpServerResponse.text("Invalid static file path", { status: 400 });
      }
    }

    const fileInfo = yield* fileSystem.stat(filePath).pipe(Effect.orElseSucceed(() => null));
    if (!fileInfo || fileInfo.type !== "File") {
      const indexPath = path.resolve(staticRoot, "index.html");
      const indexData = yield* fileSystem
        .readFile(indexPath)
        .pipe(Effect.orElseSucceed(() => null));
      if (!indexData) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }
      return HttpServerResponse.uint8Array(maybeRewriteIndexHtml(indexData, publicPathPrefix), {
        status: 200,
        contentType: "text/html; charset=utf-8",
      });
    }

    const contentType = Mime.getType(filePath) ?? "application/octet-stream";
    const data = yield* fileSystem.readFile(filePath).pipe(Effect.orElseSucceed(() => null));
    if (!data) {
      return HttpServerResponse.text("Internal Server Error", { status: 500 });
    }

    const responseBody =
      contentType.startsWith("text/html") && publicPathPrefix
        ? maybeRewriteIndexHtml(data, publicPathPrefix)
        : contentType.startsWith("text/css") && publicPathPrefix
          ? maybeRewriteCss(data, publicPathPrefix)
          : data;

    return HttpServerResponse.uint8Array(responseBody, {
      status: 200,
      contentType,
    });
  }),
);
