import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const BrowserAutomationOptionalTimeoutMs = Schema.optional(
  Schema.Int.check(Schema.isGreaterThan(0))
    .check(Schema.isLessThanOrEqualTo(60_000))
    .annotate({ description: "Maximum wait in milliseconds. Defaults to 15000; maximum 60000." }),
).annotate({ description: "Maximum wait in milliseconds. Defaults to 15000; maximum 60000." });

export const BrowserAutomationLocator = TrimmedNonEmptyString.annotate({
  description:
    "Playwright selector, preferably role/text based, for example role=button[name='Send'] or text=Continue. Use a snapshot first when the target is unknown.",
});

export const BrowserAutomationLegacySelector = TrimmedNonEmptyString.annotate({
  description:
    "Legacy CSS selector such as button[type='submit']. Prefer locator for resilient role/text targeting.",
});

export const BrowserAutomationStatus = Schema.Struct({
  available: Schema.Boolean,
  visible: Schema.Boolean,
  url: Schema.NullOr(Schema.String),
  title: Schema.NullOr(Schema.String),
  loading: Schema.Boolean,
});
export type BrowserAutomationStatus = typeof BrowserAutomationStatus.Type;

export const BrowserAutomationClickInput = Schema.Struct({
  selector: Schema.optional(BrowserAutomationLegacySelector).annotate({
    description:
      "Legacy CSS selector such as button[type='submit']. Prefer locator for resilient role/text targeting.",
  }),
  locator: Schema.optional(BrowserAutomationLocator).annotate({
    description:
      "Playwright selector, preferably role/text based, for example role=button[name='Send'] or text=Continue. Use a snapshot first when the target is unknown.",
  }),
  x: Schema.optional(
    Schema.Finite.annotate({
      description: "Viewport-relative X coordinate in CSS pixels. Must be paired with y.",
    }),
  ),
  y: Schema.optional(
    Schema.Finite.annotate({
      description: "Viewport-relative Y coordinate in CSS pixels. Must be paired with x.",
    }),
  ),
  timeoutMs: BrowserAutomationOptionalTimeoutMs,
})
  .check(
    Schema.makeFilter((input) => {
      const selectorModes =
        Number(input.selector !== undefined) + Number(input.locator !== undefined);
      const hasX = input.x !== undefined;
      const hasY = input.y !== undefined;
      if (hasX !== hasY) return "Coordinates require both x and y.";
      const coordinateModes = hasX && hasY ? 1 : 0;
      return selectorModes + coordinateModes === 1 || "Provide exactly one click target.";
    }),
  )
  .annotate({
    description:
      "Clicks one target. Provide exactly one of locator, selector, or the x/y coordinate pair.",
  });
export type BrowserAutomationClickInput = typeof BrowserAutomationClickInput.Type;

export const BrowserAutomationTypeInput = Schema.Struct({
  text: Schema.String.annotate({ description: "Literal text to insert." }),
  selector: Schema.optional(BrowserAutomationLegacySelector).annotate({
    description: "Legacy CSS selector for the input. Prefer locator.",
  }),
  locator: Schema.optional(BrowserAutomationLocator).annotate({
    description:
      "Playwright selector for the input, for example role=textbox[name='Message'] or textarea[placeholder*='Message'].",
  }),
  clear: Schema.optional(
    Schema.Boolean.annotate({
      description: "Clear the existing input value before inserting text. Defaults to false.",
    }),
  ),
  timeoutMs: BrowserAutomationOptionalTimeoutMs,
})
  .check(
    Schema.makeFilter(
      (input) =>
        !(input.selector !== undefined && input.locator !== undefined) ||
        "Provide at most one of selector or locator.",
    ),
  )
  .annotate({
    description:
      "Types into locator/selector, or into the currently focused element when neither target is provided.",
  });
export type BrowserAutomationTypeInput = typeof BrowserAutomationTypeInput.Type;

export const BrowserAutomationPressInput = Schema.Struct({
  key: Schema.String.check(Schema.isTrimmed())
    .check(
      Schema.isNonEmpty({
        description:
          "Keyboard key name such as Enter, Escape, Tab, ArrowDown, Backspace, or a single character.",
      }),
    )
    .annotateKey({
      description:
        "Keyboard key name such as Enter, Escape, Tab, ArrowDown, Backspace, or a single character.",
    }),
  modifiers: Schema.optional(
    Schema.Array(Schema.Literals(["Alt", "Control", "Meta", "Shift"])).annotate({
      description: "Modifier keys held while pressing key.",
    }),
  ),
}).annotate({ description: "Presses one keyboard key in the active browser surface." });
export type BrowserAutomationPressInput = typeof BrowserAutomationPressInput.Type;

export const BrowserAutomationScrollInput = Schema.Struct({
  deltaX: Schema.optional(
    Schema.Finite.annotate({
      description: "Horizontal scroll delta in CSS pixels. Positive scrolls right. Defaults to 0.",
    }),
  ),
  deltaY: Schema.optional(
    Schema.Finite.annotate({
      description: "Vertical scroll delta in CSS pixels. Positive scrolls down. Defaults to 0.",
    }),
  ),
  selector: Schema.optional(BrowserAutomationLegacySelector).annotate({
    description: "Legacy CSS selector for a scrollable container. Omit to scroll the viewport.",
  }),
  locator: Schema.optional(BrowserAutomationLocator).annotate({
    description: "Playwright selector for a scrollable container. Omit to scroll the viewport.",
  }),
})
  .check(
    Schema.makeFilter((input) => {
      if (input.selector !== undefined && input.locator !== undefined) {
        return "Provide at most one of selector or locator.";
      }
      return (
        input.deltaX !== undefined || input.deltaY !== undefined || "Provide deltaX or deltaY."
      );
    }),
  )
  .annotate({
    description:
      "Scrolls the viewport, or a locator/selector container. Provide deltaX, deltaY, or both.",
  });
export type BrowserAutomationScrollInput = typeof BrowserAutomationScrollInput.Type;

export const BrowserAutomationEvaluateInput = Schema.Struct({
  expression: Schema.String.check(Schema.isTrimmed())
    .check(
      Schema.isNonEmpty({
        description:
          "JavaScript expression evaluated in the page's main frame, for example document.title or (() => ({href: location.href}))().",
      }),
    )
    .check(Schema.isMaxLength(64_000))
    .annotateKey({
      description:
        "JavaScript expression evaluated in the page's main frame, for example document.title or (() => ({href: location.href}))().",
    }),
  awaitPromise: Schema.optional(
    Schema.Boolean.annotate({ description: "Await a returned Promise. Defaults to true." }),
  ),
  returnByValue: Schema.optional(
    Schema.Boolean.annotate({
      description:
        "Serialize and return the value instead of a remote object reference. Defaults to true.",
    }),
  ),
}).annotate({
  description:
    "Evaluates JavaScript in the page. Prefer snapshot and semantic actions; use evaluate for inspection or unsupported interactions.",
});
export type BrowserAutomationEvaluateInput = typeof BrowserAutomationEvaluateInput.Type;

export const BrowserAutomationWaitForInput = Schema.Struct({
  selector: Schema.optional(BrowserAutomationLegacySelector).annotate({
    description: "Legacy CSS selector that must match an element. Prefer locator.",
  }),
  locator: Schema.optional(BrowserAutomationLocator).annotate({
    description:
      "Playwright selector that must match an element, for example role=button[name='Send'].",
  }),
  text: Schema.optional(
    TrimmedNonEmptyString.annotate({
      description: "Case-sensitive substring that must appear in visible document text.",
    }),
  ).annotate({
    description: "Case-sensitive substring that must appear in visible document text.",
  }),
  urlIncludes: Schema.optional(
    TrimmedNonEmptyString.annotate({
      description: "Substring that must appear in the current absolute URL.",
    }),
  ).annotate({ description: "Substring that must appear in the current absolute URL." }),
  timeoutMs: BrowserAutomationOptionalTimeoutMs,
})
  .check(
    Schema.makeFilter((input) => {
      if (input.selector !== undefined && input.locator !== undefined) {
        return "Provide at most one of selector or locator.";
      }
      return (
        input.selector !== undefined ||
        input.locator !== undefined ||
        input.text !== undefined ||
        input.urlIncludes !== undefined ||
        "Provide at least one wait condition."
      );
    }),
  )
  .annotate({
    description:
      "Waits until all provided conditions match. Use after click/type when the page changes asynchronously.",
  });
export type BrowserAutomationWaitForInput = typeof BrowserAutomationWaitForInput.Type;

export const BrowserAutomationElement = Schema.Struct({
  tag: Schema.String,
  role: Schema.NullOr(Schema.String),
  name: Schema.String,
  selector: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export type BrowserAutomationElement = typeof BrowserAutomationElement.Type;

export const BrowserAutomationConsoleEntry = Schema.Struct({
  level: Schema.String,
  text: Schema.String,
  timestamp: Schema.String,
  source: Schema.optional(Schema.String),
});
export type BrowserAutomationConsoleEntry = typeof BrowserAutomationConsoleEntry.Type;

export const BrowserAutomationNetworkEntry = Schema.Struct({
  url: Schema.String,
  method: Schema.String,
  status: Schema.NullOr(Schema.Number),
  failed: Schema.Boolean,
  errorText: Schema.optional(Schema.String),
  timestamp: Schema.String,
});
export type BrowserAutomationNetworkEntry = typeof BrowserAutomationNetworkEntry.Type;

export const BrowserAutomationActionEvent = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  status: Schema.Literals(["running", "succeeded", "failed", "interrupted"]),
  startedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type BrowserAutomationActionEvent = typeof BrowserAutomationActionEvent.Type;

export const BrowserAutomationScreenshot = Schema.Struct({
  mimeType: Schema.Literal("image/png"),
  data: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
});
export type BrowserAutomationScreenshot = typeof BrowserAutomationScreenshot.Type;

export const BrowserAutomationSnapshot = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  loading: Schema.Boolean,
  visibleText: Schema.String,
  interactiveElements: Schema.Array(BrowserAutomationElement),
  accessibilityTree: Schema.Unknown,
  consoleEntries: Schema.Array(BrowserAutomationConsoleEntry),
  networkEntries: Schema.Array(BrowserAutomationNetworkEntry),
  actionTimeline: Schema.Array(BrowserAutomationActionEvent),
  screenshot: BrowserAutomationScreenshot,
});
export type BrowserAutomationSnapshot = typeof BrowserAutomationSnapshot.Type;

export class BrowserAutomationUnavailableError extends Schema.TaggedErrorClass<BrowserAutomationUnavailableError>()(
  "BrowserAutomationUnavailableError",
  { message: Schema.String },
) {}

export class BrowserAutomationNoFocusedOwnerError extends Schema.TaggedErrorClass<BrowserAutomationNoFocusedOwnerError>()(
  "BrowserAutomationNoFocusedOwnerError",
  { message: Schema.String },
) {}

export class BrowserAutomationUnsupportedClientError extends Schema.TaggedErrorClass<BrowserAutomationUnsupportedClientError>()(
  "BrowserAutomationUnsupportedClientError",
  { message: Schema.String },
) {}

export class BrowserAutomationTargetNotFoundError extends Schema.TaggedErrorClass<BrowserAutomationTargetNotFoundError>()(
  "BrowserAutomationTargetNotFoundError",
  { message: Schema.String },
) {}

export class BrowserAutomationTimeoutError extends Schema.TaggedErrorClass<BrowserAutomationTimeoutError>()(
  "BrowserAutomationTimeoutError",
  { message: Schema.String },
) {}

export class BrowserAutomationControlInterruptedError extends Schema.TaggedErrorClass<BrowserAutomationControlInterruptedError>()(
  "BrowserAutomationControlInterruptedError",
  { message: Schema.String },
) {}

export class BrowserAutomationExecutionError extends Schema.TaggedErrorClass<BrowserAutomationExecutionError>()(
  "BrowserAutomationExecutionError",
  { message: Schema.String, detail: Schema.optional(Schema.Unknown) },
) {}

export class BrowserAutomationInvalidSelectorError extends Schema.TaggedErrorClass<BrowserAutomationInvalidSelectorError>()(
  "BrowserAutomationInvalidSelectorError",
  { message: Schema.String, selector: Schema.String },
) {}

export class BrowserAutomationResultTooLargeError extends Schema.TaggedErrorClass<BrowserAutomationResultTooLargeError>()(
  "BrowserAutomationResultTooLargeError",
  { message: Schema.String, maximumBytes: Schema.Int },
) {}

export const BrowserAutomationError = Schema.Union([
  BrowserAutomationUnavailableError,
  BrowserAutomationNoFocusedOwnerError,
  BrowserAutomationUnsupportedClientError,
  BrowserAutomationTargetNotFoundError,
  BrowserAutomationTimeoutError,
  BrowserAutomationControlInterruptedError,
  BrowserAutomationExecutionError,
  BrowserAutomationInvalidSelectorError,
  BrowserAutomationResultTooLargeError,
]);
export type BrowserAutomationError = typeof BrowserAutomationError.Type;
