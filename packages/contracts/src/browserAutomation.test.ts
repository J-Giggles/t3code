import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  AppAutomationRequest,
  AppAutomationResponse,
  BrowserAutomationClickInput,
  BrowserAutomationEvaluateInput,
  BrowserAutomationTypeInput,
  BrowserAutomationWaitForInput,
} from "./index.ts";

const decodeClick = Schema.decodeUnknownEffect(BrowserAutomationClickInput);
const encodeClick = Schema.encodeEffect(BrowserAutomationClickInput);
const decodeType = Schema.decodeUnknownEffect(BrowserAutomationTypeInput);
const decodeWaitFor = Schema.decodeUnknownEffect(BrowserAutomationWaitForInput);
const decodeEvaluate = Schema.decodeUnknownEffect(BrowserAutomationEvaluateInput);
const decodeAppRequest = Schema.decodeUnknownEffect(AppAutomationRequest);
const decodeAppResponse = Schema.decodeUnknownEffect(AppAutomationResponse);

it.effect("decodes and encodes generic click input", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeClick({ locator: "role=button[name='Send']", timeoutMs: 500 });
    assert.strictEqual(parsed.locator, "role=button[name='Send']");
    const encoded = yield* encodeClick(parsed);
    assert.deepStrictEqual(encoded, { locator: "role=button[name='Send']", timeoutMs: 500 });
  }),
);

it.effect("decodes valid type, wait, and evaluate inputs", () =>
  Effect.gen(function* () {
    const typed = yield* decodeType({ selector: "textarea", text: "hello", clear: true });
    assert.strictEqual(typed.text, "hello");
    assert.strictEqual(typed.clear, true);

    const wait = yield* decodeWaitFor({ text: "Ready", urlIncludes: "/thread/" });
    assert.strictEqual(wait.text, "Ready");

    const evaluate = yield* decodeEvaluate({ expression: "document.title" });
    assert.strictEqual(evaluate.expression, "document.title");
  }),
);

it.effect("rejects malformed browser automation inputs", () =>
  Effect.gen(function* () {
    const badClick = yield* Effect.exit(decodeClick({ selector: "button", x: 10, y: 20 }));
    assert.strictEqual(badClick._tag, "Failure");

    const badWait = yield* Effect.exit(decodeWaitFor({}));
    assert.strictEqual(badWait._tag, "Failure");
  }),
);

it.effect("validates app automation request and response payloads", () =>
  Effect.gen(function* () {
    const request = yield* decodeAppRequest({
      requestId: "request-1",
      threadId: "thread-1",
      operation: "click",
      input: { x: 1, y: 2 },
      timeoutMs: 1000,
    });
    assert.strictEqual(request.operation, "click");

    const response = yield* decodeAppResponse({
      requestId: "request-1",
      ok: false,
      error: {
        _tag: "BrowserAutomationUnavailableError",
        message: "missing owner",
      },
    });
    assert.strictEqual(response.ok, false);

    const malformed = yield* Effect.exit(
      decodeAppRequest({
        requestId: "request-1",
        threadId: "thread-1",
        operation: "not-real",
        input: {},
        timeoutMs: 1000,
      }),
    );
    assert.strictEqual(malformed._tag, "Failure");
  }),
);
