import * as NodeZlib from "node:zlib";

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type { HttpServerResponse } from "effect/unstable/http/HttpServerResponse";
import * as HttpServerResponseApi from "effect/unstable/http/HttpServerResponse";

const MINIMUM_GZIP_BODY_BYTES = 16 * 1024;
const THREAD_DETAIL_PATH = /^\/(?:[^/]+\/)?api\/orchestration\/threads\/[^/]+\/?$/;

export function isThreadDetailRequest(method: string, originalUrl: string): boolean {
  if (method !== "GET") return false;
  try {
    return THREAD_DETAIL_PATH.test(new URL(originalUrl, "http://127.0.0.1").pathname);
  } catch {
    return false;
  }
}

function acceptsGzip(value: string | undefined): boolean {
  if (!value) return false;
  return value.split(",").some((entry) => {
    const [encoding, ...parameters] = entry.trim().toLowerCase().split(";");
    if (encoding !== "gzip") return false;
    return !parameters.some((parameter) => /^q\s*=\s*0(?:\.0*)?$/.test(parameter.trim()));
  });
}

function varyOnAcceptEncoding(current: string | undefined): string {
  if (!current) return "Accept-Encoding";
  const values = current.split(",").map((value) => value.trim());
  return values.some((value) => value.toLowerCase() === "accept-encoding")
    ? current
    : `${current}, Accept-Encoding`;
}

export class GzipCompressionError extends Data.TaggedError("GzipCompressionError")<{
  readonly cause: unknown;
}> {}

export type GzipBytes = (input: Uint8Array) => Effect.Effect<Uint8Array, GzipCompressionError>;

const gzipBytes: GzipBytes = Effect.fn("httpCompression.gzipBytes")((input: Uint8Array) =>
  Effect.callback<Uint8Array, GzipCompressionError>((resume) => {
    const gzip = NodeZlib.createGzip();
    const chunks: Buffer[] = [];
    let settled = false;
    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.once("error", (cause) => {
      if (settled) return;
      settled = true;
      resume(Effect.fail(new GzipCompressionError({ cause })));
    });
    gzip.once("end", () => {
      if (settled) return;
      settled = true;
      resume(Effect.succeed(Buffer.concat(chunks)));
    });
    gzip.end(input);
    return Effect.sync(() => {
      settled = true;
      gzip.destroy();
    });
  }),
);

export function gzipJsonResponse(
  response: HttpServerResponse,
  acceptEncoding: string | undefined,
  compress: GzipBytes = gzipBytes,
): Effect.Effect<HttpServerResponse> {
  const body = response.body;
  if (response.headers["content-encoding"] !== undefined || body._tag !== "Uint8Array") {
    return Effect.succeed(response);
  }
  const contentType = body.contentType ?? response.headers["content-type"];
  if (
    body.contentLength < MINIMUM_GZIP_BODY_BYTES ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    return Effect.succeed(response);
  }

  const negotiatedResponse = response.pipe(
    HttpServerResponseApi.setHeader("vary", varyOnAcceptEncoding(response.headers.vary)),
  );
  if (!acceptsGzip(acceptEncoding)) {
    return Effect.succeed(negotiatedResponse);
  }

  return compress(body.body).pipe(
    Effect.map((compressed) =>
      negotiatedResponse.pipe(
        HttpServerResponseApi.setBody(HttpBody.uint8Array(compressed, contentType)),
        HttpServerResponseApi.setHeader("content-encoding", "gzip"),
      ),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("Could not gzip HTTP response; sending it uncompressed.", {
        cause,
        contentLength: body.contentLength,
        contentType,
      }).pipe(Effect.as(negotiatedResponse)),
    ),
  );
}

export const gzipJsonResponseMiddleware = HttpMiddleware.make((httpApp) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isThreadDetailRequest(request.method, request.originalUrl)) {
      return yield* httpApp;
    }
    yield* HttpEffect.appendPreResponseHandler((_request, response) =>
      gzipJsonResponse(response, request.headers["accept-encoding"]),
    );
    return yield* httpApp;
  }),
);

export const gzipJsonResponseLayer = HttpRouter.middleware(gzipJsonResponseMiddleware, {
  global: true,
});
