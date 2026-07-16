import * as NodeZlib from "node:zlib";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import {
  gzipJsonResponse,
  gzipJsonResponseMiddleware,
  GzipCompressionError,
  isThreadDetailRequest,
} from "./httpCompression.ts";

function largeJsonBytes(): Uint8Array {
  return new TextEncoder().encode(`{"payload":"${"x".repeat(32_000)}"}`);
}

describe("isThreadDetailRequest", () => {
  it("matches root and single-segment hosted task-detail routes", () => {
    expect(isThreadDetailRequest("GET", "/api/orchestration/threads/thread-1")).toBe(true);
    expect(isThreadDetailRequest("GET", "/staging/api/orchestration/threads/thread-1?x=1")).toBe(
      true,
    );
  });

  it("does not expand compression to unrelated routes or methods", () => {
    expect(isThreadDetailRequest("GET", "/api/orchestration/snapshot")).toBe(false);
    expect(isThreadDetailRequest("GET", "/api/orchestration/threads/thread-1/events")).toBe(false);
    expect(isThreadDetailRequest("POST", "/api/orchestration/threads/thread-1")).toBe(false);
  });
});

describe("gzipJsonResponse", () => {
  it.effect("compresses a large JSON response when the client accepts gzip", () =>
    Effect.gen(function* () {
      const original = largeJsonBytes();
      const response = HttpServerResponse.uint8Array(original, {
        contentType: "application/json",
      });

      const compressed = yield* gzipJsonResponse(response, "br, gzip");

      expect(compressed.headers["content-encoding"]).toBe("gzip");
      expect(compressed.headers.vary).toBe("Accept-Encoding");
      expect(compressed.body._tag).toBe("Uint8Array");
      if (compressed.body._tag !== "Uint8Array") {
        throw new Error("Expected a byte-array response body");
      }
      expect(Buffer.from(NodeZlib.gunzipSync(compressed.body.body))).toEqual(Buffer.from(original));
      expect(compressed.body.contentLength).toBeLessThan(original.length);
    }),
  );

  it.effect("returns an identity variant with cache negotiation when gzip is not accepted", () =>
    Effect.gen(function* () {
      const response = HttpServerResponse.uint8Array(largeJsonBytes(), {
        contentType: "application/json",
      });

      const brOnly = yield* gzipJsonResponse(response, "br");
      const gzipDisabled = yield* gzipJsonResponse(response, "gzip;q=0");

      expect(brOnly.body).toBe(response.body);
      expect(gzipDisabled.body).toBe(response.body);
      expect(brOnly.headers.vary).toBe("Accept-Encoding");
      expect(gzipDisabled.headers.vary).toBe("Accept-Encoding");
    }),
  );

  it.effect("does not spend compression work on small JSON responses", () =>
    Effect.gen(function* () {
      const response = HttpServerResponse.jsonUnsafe({ ok: true });

      expect(yield* gzipJsonResponse(response, "gzip")).toBe(response);
    }),
  );

  it.effect("leaves already-encoded and non-JSON responses unchanged", () =>
    Effect.gen(function* () {
      const body = new TextEncoder().encode("x".repeat(32_000));
      const encoded = HttpServerResponse.uint8Array(body, {
        contentType: "application/json",
        headers: { "content-encoding": "br" },
      });
      const text = HttpServerResponse.uint8Array(body, { contentType: "text/plain" });

      expect(yield* gzipJsonResponse(encoded, "gzip")).toBe(encoded);
      expect(yield* gzipJsonResponse(text, "gzip")).toBe(text);
    }),
  );

  it.effect("falls back to the identity variant when gzip reports a typed failure", () =>
    Effect.gen(function* () {
      const response = HttpServerResponse.uint8Array(largeJsonBytes(), {
        contentType: "application/json",
      });
      const compressed = yield* gzipJsonResponse(response, "gzip", () =>
        Effect.fail(new GzipCompressionError({ cause: "injected gzip failure" })),
      );

      expect(compressed.body).toBe(response.body);
      expect(compressed.headers["content-encoding"]).toBeUndefined();
      expect(compressed.headers.vary).toBe("Accept-Encoding");
    }),
  );

  it.effect("preserves existing Vary values", () =>
    Effect.gen(function* () {
      const response = HttpServerResponse.uint8Array(largeJsonBytes(), {
        contentType: "application/json",
        headers: { vary: "Origin" },
      });

      const compressed = yield* gzipJsonResponse(response, "gzip");

      expect(compressed.headers.vary).toBe("Origin, Accept-Encoding");
    }),
  );

  it("composes after CORS without losing either cache variation", async () => {
    const original = largeJsonBytes();
    const app = HttpMiddleware.cors({ allowedOrigins: ["http://desktop.test"] })(
      gzipJsonResponseMiddleware(
        Effect.succeed(
          HttpServerResponse.uint8Array(original, { contentType: "application/json" }),
        ),
      ),
    );
    const handler = HttpEffect.toWebHandler(app);

    const response = await handler(
      new Request("http://127.0.0.1/api/orchestration/threads/thread-1", {
        headers: {
          "Accept-Encoding": "gzip",
          Origin: "http://desktop.test",
        },
      }),
    );

    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(
      response.headers
        .get("vary")
        ?.split(",")
        .map((value) => value.trim()),
    ).toEqual(expect.arrayContaining(["Origin", "Accept-Encoding"]));
    expect(Buffer.from(NodeZlib.gunzipSync(await response.arrayBuffer()))).toEqual(
      Buffer.from(original),
    );
  });
});
