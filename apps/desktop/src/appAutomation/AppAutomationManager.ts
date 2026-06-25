import type {
  AppAutomationClickInput,
  AppAutomationEvaluateInput,
  AppAutomationPressInput,
  AppAutomationScrollInput,
  AppAutomationSnapshot,
  AppAutomationStatus,
  AppAutomationTypeInput,
  AppAutomationWaitForInput,
  BrowserAutomationActionEvent,
} from "@t3tools/contracts";
import {
  BrowserAutomationControlInterruptedError,
  BrowserAutomationExecutionError,
  BrowserAutomationInvalidSelectorError,
  BrowserAutomationResultTooLargeError,
  BrowserAutomationTargetNotFoundError,
  BrowserAutomationTimeoutError,
} from "@t3tools/contracts";
import type { BrowserWindow, KeyboardInputEvent, WebContents } from "electron";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { playwrightInjectedRuntimeInstallExpression } from "../preview/PlaywrightInjectedRuntime.ts";

const MAX_EVALUATION_BYTES = 64_000;
const MAX_VISIBLE_TEXT_LENGTH = 20_000;
const MAX_INTERACTIVE_ELEMENTS = 200;
const MAX_SCREENSHOT_WIDTH = 1280;
const DEFAULT_WAIT_TIMEOUT_MS = 15_000;
const encodeUnknownJson = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString);

type AutomationError =
  | BrowserAutomationControlInterruptedError
  | BrowserAutomationExecutionError
  | BrowserAutomationInvalidSelectorError
  | BrowserAutomationResultTooLargeError
  | BrowserAutomationTargetNotFoundError
  | BrowserAutomationTimeoutError;

const causeDetail = (cause: unknown): unknown => {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  return { message: String(cause) };
};

const toJsLiteral = (value: unknown): string => JSON.stringify(value) ?? "undefined";

const automationLocator = (
  input:
    | AppAutomationClickInput
    | AppAutomationTypeInput
    | AppAutomationScrollInput
    | AppAutomationWaitForInput,
): string | null => {
  if (input.locator !== undefined) return input.locator;
  if (input.selector !== undefined) return `css=${input.selector}`;
  return null;
};

const modifierNames = (
  modifiers: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift"> = [],
): NonNullable<KeyboardInputEvent["modifiers"]> =>
  modifiers.map((modifier) => modifier.toLowerCase()) as NonNullable<
    KeyboardInputEvent["modifiers"]
  >;

const makeControlInterrupted = () =>
  new BrowserAutomationControlInterruptedError({
    message: "T3 Code shell control was interrupted by human input.",
  });

export interface AppAutomationManagerShape {
  readonly status: () => Effect.Effect<AppAutomationStatus, AutomationError>;
  readonly show: () => Effect.Effect<AppAutomationStatus, AutomationError>;
  readonly snapshot: () => Effect.Effect<AppAutomationSnapshot, AutomationError>;
  readonly click: (input: AppAutomationClickInput) => Effect.Effect<void, AutomationError>;
  readonly type: (input: AppAutomationTypeInput) => Effect.Effect<void, AutomationError>;
  readonly press: (input: AppAutomationPressInput) => Effect.Effect<void, AutomationError>;
  readonly scroll: (input: AppAutomationScrollInput) => Effect.Effect<void, AutomationError>;
  readonly evaluate: (input: AppAutomationEvaluateInput) => Effect.Effect<unknown, AutomationError>;
  readonly waitFor: (input: AppAutomationWaitForInput) => Effect.Effect<void, AutomationError>;
}

export class AppAutomationManager extends Context.Service<
  AppAutomationManager,
  AppAutomationManagerShape
>()("@t3tools/desktop/appAutomation/AppAutomationManager") {}

const make = Effect.gen(function* () {
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const playwrightInstallExpression = yield* Effect.cached(
    playwrightInjectedRuntimeInstallExpression().pipe(
      Effect.mapError(
        (cause) =>
          new BrowserAutomationExecutionError({
            message: "Failed to prepare the app shell selector runtime.",
            detail: causeDetail(cause),
          }),
      ),
    ),
  );
  const actionTimelineRef = yield* Ref.make<ReadonlyArray<BrowserAutomationActionEvent>>([]);
  const actionSequenceRef = yield* Ref.make(0);

  const currentIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const currentMillis = Clock.currentTimeMillis;
  const nextSequence = Ref.modify(actionSequenceRef, (value) => [value, value + 1] as const);

  const statusForWindow = (window: BrowserWindow): AppAutomationStatus => ({
    available: !window.isDestroyed(),
    visible: !window.isDestroyed() && window.isVisible(),
    url: window.isDestroyed() ? null : window.webContents.getURL() || null,
    title: window.isDestroyed() ? null : window.getTitle() || window.webContents.getTitle() || null,
    loading: !window.isDestroyed() && window.webContents.isLoading(),
  });

  const status = Effect.fn("AppAutomationManager.status")(function* () {
    const window = yield* electronWindow.currentMainOrFirst;
    if (Option.isNone(window) || window.value.isDestroyed()) {
      return {
        available: false,
        visible: false,
        url: null,
        title: null,
        loading: false,
      };
    }
    return statusForWindow(window.value);
  });

  const requireWindow = Effect.fn("AppAutomationManager.requireWindow")(function* () {
    const window = yield* electronWindow.currentMainOrFirst;
    if (Option.isNone(window) || window.value.isDestroyed()) {
      return yield* new BrowserAutomationTargetNotFoundError({
        message: "No T3 Code app window is available for shell automation.",
      });
    }
    return window.value;
  });

  const executeJavaScript = <A>(
    wc: WebContents,
    operation: string,
    expression: string,
  ): Effect.Effect<A, BrowserAutomationExecutionError> =>
    Effect.tryPromise({
      try: () => wc.executeJavaScript(expression, true) as Promise<A>,
      catch: (cause) =>
        new BrowserAutomationExecutionError({
          message: `Desktop shell automation failed during ${operation}.`,
          detail: causeDetail(cause),
        }),
    });

  const ensurePlaywrightInjected = (wc: WebContents) =>
    Effect.gen(function* () {
      const expression = yield* playwrightInstallExpression;
      yield* executeJavaScript(wc, "ensureSelectorRuntime", expression);
    });

  const pushAction = (event: BrowserAutomationActionEvent) =>
    Ref.update(actionTimelineRef, (timeline) => [...timeline, event].slice(-200));

  const replaceAction = (event: BrowserAutomationActionEvent) =>
    Ref.update(actionTimelineRef, (timeline) =>
      timeline.map((candidate) => (candidate.id === event.id ? event : candidate)),
    );

  const withAction = Effect.fn("AppAutomationManager.withAction")(function* <A>(
    action: string,
    use: Effect.Effect<A, AutomationError>,
  ) {
    const sequence = yield* nextSequence;
    const startedAt = yield* currentIso;
    const millis = yield* currentMillis;
    const actionEvent: BrowserAutomationActionEvent = {
      id: `app-action-${millis.toString(36)}-${sequence.toString(36)}`,
      action,
      status: "running",
      startedAt,
    };
    yield* pushAction(actionEvent);
    const exit = yield* Effect.exit(use);
    const completedAt = yield* currentIso;
    if (Exit.isSuccess(exit)) {
      yield* replaceAction({ ...actionEvent, status: "succeeded", completedAt });
      return exit.value;
    }

    const renderedCause = Cause.pretty(exit.cause);
    yield* replaceAction({
      ...actionEvent,
      status: renderedCause.includes("BrowserAutomationControlInterruptedError")
        ? "interrupted"
        : "failed",
      completedAt,
      error: renderedCause,
    });
    return yield* Effect.failCause(exit.cause);
  });

  const installInterruptionGuard = Effect.fn("AppAutomationManager.installInterruptionGuard")(
    function* (wc: WebContents) {
      yield* executeJavaScript(
        wc,
        "installInterruptionGuard",
        `(() => {
          if (globalThis.__t3AppAutomationControl) {
            return globalThis.__t3AppAutomationControl.epoch;
          }
          const state = { epoch: 0, expected: [] };
          const matchesPointer = (expected, event) =>
            expected.kind === "pointer" &&
            Math.abs(expected.x - event.clientX) <= 2 &&
            Math.abs(expected.y - event.clientY) <= 2 &&
            (expected.button ?? 0) === event.button;
          const matchesKey = (expected, event) =>
            expected.kind === "key" &&
            (expected.key === event.key || expected.key === event.code);
          const consumeExpected = (event, matcher) => {
            const index = state.expected.findIndex((expected) => matcher(expected, event));
            if (index >= 0) {
              state.expected.splice(index, 1);
              return true;
            }
            state.epoch += 1;
            return false;
          };
          window.addEventListener("pointerdown", (event) => consumeExpected(event, matchesPointer), true);
          window.addEventListener("keydown", (event) => consumeExpected(event, matchesKey), true);
          globalThis.__t3AppAutomationControl = state;
          return state.epoch;
        })()`,
      );
    },
  );

  const readControlEpoch = (wc: WebContents) =>
    executeJavaScript<number>(
      wc,
      "readControlEpoch",
      "globalThis.__t3AppAutomationControl?.epoch ?? 0",
    );

  const expectInput = (wc: WebContents, input: unknown) =>
    executeJavaScript(
      wc,
      "expectInput",
      `(() => {
        const state = globalThis.__t3AppAutomationControl;
        if (!state) return false;
        state.expected.push(${toJsLiteral(input)});
        return true;
      })()`,
    );

  const checkControlEpoch = Effect.fn("AppAutomationManager.checkControlEpoch")(function* (
    wc: WebContents,
    epoch: number,
  ) {
    const current = yield* readControlEpoch(wc);
    if (current !== epoch) {
      return yield* makeControlInterrupted();
    }
  });

  const resolvePoint = Effect.fn("AppAutomationManager.resolvePoint")(function* (
    wc: WebContents,
    input: AppAutomationClickInput,
  ) {
    if (input.x !== undefined && input.y !== undefined) {
      return { x: input.x, y: input.y };
    }
    const locator = automationLocator(input);
    if (!locator) {
      return yield* new BrowserAutomationExecutionError({
        message: "Click target is missing.",
      });
    }
    yield* ensurePlaywrightInjected(wc);
    const result = yield* executeJavaScript<
      { x: number; y: number } | { invalidSelector: true; message: string } | { notFound: true }
    >(
      wc,
      "resolveClickPoint",
      `(() => {
        try {
          const injected = globalThis.__t3PlaywrightInjected;
          const parsed = injected.parseSelector(${toJsLiteral(locator)});
          const element = injected.querySelector(parsed, document, true);
          if (!element) return { notFound: true };
          const visible = injected.elementState(element, "visible");
          const enabled = injected.elementState(element, "enabled");
          if (!visible.matches || !enabled.matches) return { notFound: true };
          element.scrollIntoView({ block: "center", inline: "center" });
          const rect = element.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } catch (error) {
          return { invalidSelector: true, message: String(error) };
        }
      })()`,
    );
    if ("invalidSelector" in result) {
      return yield* new BrowserAutomationInvalidSelectorError({
        message: result.message,
        selector: locator,
      });
    }
    if ("notFound" in result) {
      return yield* new BrowserAutomationExecutionError({
        message: `No element matches locator ${locator}.`,
      });
    }
    return result;
  });

  const focusTarget = Effect.fn("AppAutomationManager.focusTarget")(function* (
    wc: WebContents,
    input: AppAutomationTypeInput,
  ) {
    const locator = automationLocator(input);
    if (locator) yield* ensurePlaywrightInjected(wc);
    const locatorLiteral = locator ? toJsLiteral(locator) : null;
    const result = yield* executeJavaScript<
      { ok: true } | { invalidSelector: true; message: string } | { notFound: true }
    >(
      wc,
      "focusTarget",
      `(() => {
        try {
          const element = ${
            locatorLiteral
              ? `(() => {
                  const injected = globalThis.__t3PlaywrightInjected;
                  return injected.querySelector(injected.parseSelector(${locatorLiteral}), document, true);
                })()`
              : `(() => {
                  const active = document.activeElement;
                  return active && active !== document.body && active !== document.documentElement
                    ? active
                    : null;
                })()`
          };
          if (!element) return { notFound: true };
          element.focus();
          if (${input.clear === true}) {
            if ("value" in element) element.value = "";
            else if (element.isContentEditable) element.textContent = "";
            element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
          }
          return { ok: true };
        } catch (error) {
          return { invalidSelector: true, message: String(error) };
        }
      })()`,
    );
    if ("invalidSelector" in result) {
      return yield* new BrowserAutomationInvalidSelectorError({
        message: result.message,
        selector: locator ?? "",
      });
    }
    if ("notFound" in result) {
      return yield* new BrowserAutomationExecutionError({
        message: locator
          ? `No element matches locator ${locator}.`
          : "No element is focused in the T3 Code shell.",
      });
    }
  });

  const snapshot = Effect.fn("AppAutomationManager.snapshot")(function* () {
    const window = yield* requireWindow();
    return yield* withAction(
      "snapshot",
      Effect.gen(function* () {
        const wc = window.webContents;
        const page = yield* executeJavaScript<{
          url: string;
          title: string;
          loading: boolean;
          visibleText: string;
          interactiveElements: AppAutomationSnapshot["interactiveElements"];
          accessibilityTree: unknown;
        }>(
          wc,
          "snapshot.dom",
          `(() => {
            const selectorFor = (element) => {
              if (element.id) return "#" + CSS.escape(element.id);
              for (const attribute of ["data-testid", "name", "aria-label"]) {
                const value = element.getAttribute(attribute);
                if (value) return element.tagName.toLowerCase() + "[" + attribute + "=" + JSON.stringify(value) + "]";
              }
              const buildParts = (current, parts = []) => {
                if (!current || current.nodeType !== Node.ELEMENT_NODE || parts.length >= 8) return parts;
                const parent = current.parentElement;
                const siblings = parent
                  ? Array.from(parent.children).filter((child) => child.tagName === current.tagName)
                  : [];
                const base = current.tagName.toLowerCase();
                const part = siblings.length > 1
                  ? base + ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")"
                  : base;
                return buildParts(parent, [part, ...parts]);
              };
              return buildParts(element).join(" > ");
            };
            const visible = (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
            };
            const nameFor = (element) =>
              element.getAttribute("aria-label") ||
              element.innerText ||
              element.getAttribute("name") ||
              element.getAttribute("title") ||
              "";
            const elements = Array.from(document.querySelectorAll(
              "a[href],button,input,textarea,select,[role],[tabindex]"
            )).filter(visible).slice(0, ${MAX_INTERACTIVE_ELEMENTS}).map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                role: element.getAttribute("role"),
                name: nameFor(element),
                selector: selectorFor(element),
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              };
            });
            return {
              url: location.href,
              title: document.title,
              loading: document.readyState !== "complete",
              visibleText: (document.body?.innerText || "").slice(0, ${MAX_VISIBLE_TEXT_LENGTH}),
              interactiveElements: elements,
              accessibilityTree: {
                focusedSelector: document.activeElement ? selectorFor(document.activeElement) : null,
                elements: elements.map((element) => ({
                  role: element.role,
                  name: element.name,
                  selector: element.selector
                }))
              }
            };
          })()`,
        );
        const sourceImage = yield* Effect.tryPromise({
          try: () => wc.capturePage(),
          catch: (cause) =>
            new BrowserAutomationExecutionError({
              message: "Failed to capture the T3 Code shell screenshot.",
              detail: causeDetail(cause),
            }),
        });
        const sourceSize = sourceImage.getSize();
        const image =
          sourceSize.width > MAX_SCREENSHOT_WIDTH
            ? sourceImage.resize({ width: MAX_SCREENSHOT_WIDTH })
            : sourceImage;
        const size = image.getSize();
        const actionTimeline = yield* Ref.get(actionTimelineRef);
        return {
          ...page,
          consoleEntries: [],
          networkEntries: [],
          actionTimeline: [...actionTimeline],
          screenshot: {
            mimeType: "image/png" as const,
            data: image.toPNG().toString("base64"),
            width: size.width,
            height: size.height,
          },
        };
      }),
    );
  });

  const show = Effect.fn("AppAutomationManager.show")(function* () {
    const window = yield* requireWindow();
    yield* electronWindow.reveal(window);
    return statusForWindow(window);
  });

  const click = Effect.fn("AppAutomationManager.click")(function* (input: AppAutomationClickInput) {
    const window = yield* requireWindow();
    yield* withAction(
      "click",
      Effect.gen(function* () {
        const wc = window.webContents;
        yield* installInterruptionGuard(wc);
        const epoch = yield* readControlEpoch(wc);
        const point = yield* resolvePoint(wc, input);
        const viewport = yield* executeJavaScript<{ width: number; height: number }>(
          wc,
          "click.viewport",
          "({ width: window.innerWidth, height: window.innerHeight })",
        );
        if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height) {
          return yield* new BrowserAutomationExecutionError({
            message: `Click coordinates (${point.x}, ${point.y}) are outside the T3 Code shell viewport.`,
          });
        }
        yield* checkControlEpoch(wc, epoch);
        yield* expectInput(wc, { kind: "pointer", ...point, button: 0 });
        wc.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
        wc.sendInputEvent({
          type: "mouseDown",
          x: point.x,
          y: point.y,
          button: "left",
          clickCount: 1,
        });
        wc.sendInputEvent({
          type: "mouseUp",
          x: point.x,
          y: point.y,
          button: "left",
          clickCount: 1,
        });
        yield* checkControlEpoch(wc, epoch);
      }),
    );
  });

  const type = Effect.fn("AppAutomationManager.type")(function* (input: AppAutomationTypeInput) {
    const window = yield* requireWindow();
    yield* withAction(
      "type",
      Effect.gen(function* () {
        const wc = window.webContents;
        yield* focusTarget(wc, input);
        const inserter = wc as WebContents & {
          readonly insertText?: (text: string) => Promise<void> | void;
        };
        if (typeof inserter.insertText === "function") {
          yield* Effect.tryPromise({
            try: async () => {
              await inserter.insertText!(input.text);
            },
            catch: (cause) =>
              new BrowserAutomationExecutionError({
                message: "Failed to insert text into the T3 Code shell.",
                detail: causeDetail(cause),
              }),
          });
        } else {
          yield* executeJavaScript(
            wc,
            "type.fallback",
            `(() => {
              const element = document.activeElement;
              const text = ${toJsLiteral(input.text)};
              if (!element) return false;
              if ("value" in element) {
                element.value = String(element.value ?? "") + text;
              } else if (element.isContentEditable) {
                element.textContent = String(element.textContent ?? "") + text;
              }
              element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            })()`,
          );
        }
        yield* executeJavaScript(
          wc,
          "type.dispatchEvents",
          `(() => {
            const element = document.activeElement;
            const text = ${toJsLiteral(input.text)};
            element?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
            element?.dispatchEvent(new Event("change", { bubbles: true }));
          })()`,
        );
      }),
    );
  });

  const press = Effect.fn("AppAutomationManager.press")(function* (input: AppAutomationPressInput) {
    const window = yield* requireWindow();
    yield* withAction(
      "press",
      Effect.gen(function* () {
        const wc = window.webContents;
        yield* installInterruptionGuard(wc);
        const epoch = yield* readControlEpoch(wc);
        const modifiers = modifierNames(input.modifiers);
        const keyCode = input.key;
        yield* expectInput(wc, { kind: "key", key: input.key });
        wc.sendInputEvent({
          type: "keyDown",
          keyCode,
          modifiers,
        });
        wc.sendInputEvent({
          type: "keyUp",
          keyCode,
          modifiers,
        });
        yield* checkControlEpoch(wc, epoch);
      }),
    );
  });

  const scroll = Effect.fn("AppAutomationManager.scroll")(function* (
    input: AppAutomationScrollInput,
  ) {
    const window = yield* requireWindow();
    yield* withAction(
      "scroll",
      Effect.gen(function* () {
        const wc = window.webContents;
        const locator = automationLocator(input);
        if (locator) yield* ensurePlaywrightInjected(wc);
        const result = yield* executeJavaScript<
          { ok: true } | { invalidSelector: true; message: string } | { notFound: true }
        >(
          wc,
          "scroll",
          `(() => {
            try {
              const target = ${
                locator
                  ? `(() => {
                      const injected = globalThis.__t3PlaywrightInjected;
                      return injected.querySelector(injected.parseSelector(${toJsLiteral(locator)}), document, true);
                    })()`
                  : "window"
              };
              if (!target) return { notFound: true };
              target.scrollBy({ left: ${input.deltaX ?? 0}, top: ${input.deltaY ?? 0}, behavior: "instant" });
              return { ok: true };
            } catch (error) {
              return { invalidSelector: true, message: String(error) };
            }
          })()`,
        );
        if ("invalidSelector" in result) {
          return yield* new BrowserAutomationInvalidSelectorError({
            message: result.message,
            selector: locator ?? "",
          });
        }
        if ("notFound" in result) {
          return yield* new BrowserAutomationExecutionError({
            message: `No element matches locator ${locator}.`,
          });
        }
      }),
    );
  });

  const evaluate = Effect.fn("AppAutomationManager.evaluate")(function* (
    input: AppAutomationEvaluateInput,
  ) {
    const window = yield* requireWindow();
    return yield* withAction(
      "evaluate",
      Effect.gen(function* () {
        const result = yield* executeJavaScript(
          window.webContents,
          "evaluate",
          input.awaitPromise === false ? input.expression : `Promise.resolve(${input.expression})`,
        );
        const serialized =
          result === undefined
            ? ""
            : yield* encodeUnknownJson(result).pipe(
                Effect.mapError(
                  (cause) =>
                    new BrowserAutomationExecutionError({
                      message: "Evaluation result is not JSON-serializable.",
                      detail: causeDetail(cause),
                    }),
                ),
              );
        const bytes = Buffer.byteLength(serialized, "utf8");
        if (bytes > MAX_EVALUATION_BYTES) {
          return yield* new BrowserAutomationResultTooLargeError({
            message: `Evaluation result exceeds ${MAX_EVALUATION_BYTES} bytes.`,
            maximumBytes: MAX_EVALUATION_BYTES,
          });
        }
        return result;
      }),
    );
  });

  const waitFor = Effect.fn("AppAutomationManager.waitFor")(function* (
    input: AppAutomationWaitForInput,
  ) {
    const window = yield* requireWindow();
    yield* withAction(
      "waitFor",
      Effect.gen(function* () {
        const wc = window.webContents;
        const locator = automationLocator(input);
        if (locator) yield* ensurePlaywrightInjected(wc);
        const timeoutMs = input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
        const deadline = (yield* currentMillis) + timeoutMs;
        while ((yield* currentMillis) <= deadline) {
          const result = yield* executeJavaScript<
            { matched: boolean } | { invalidSelector: true; message: string }
          >(
            wc,
            "waitFor",
            `(() => {
              try {
                const selectorMatched = ${
                  locator
                    ? `(() => {
                        const injected = globalThis.__t3PlaywrightInjected;
                        return injected.querySelector(injected.parseSelector(${toJsLiteral(locator)}), document, false) !== null;
                      })()`
                    : "true"
                };
                const textMatched = ${
                  input.text !== undefined
                    ? `(document.body?.innerText || "").includes(${toJsLiteral(input.text)})`
                    : "true"
                };
                const urlMatched = ${
                  input.urlIncludes !== undefined
                    ? `location.href.includes(${toJsLiteral(input.urlIncludes)})`
                    : "true"
                };
                return { matched: selectorMatched && textMatched && urlMatched };
              } catch (error) {
                return { invalidSelector: true, message: String(error) };
              }
            })()`,
          );
          if ("invalidSelector" in result) {
            return yield* new BrowserAutomationInvalidSelectorError({
              message: result.message,
              selector: locator ?? "",
            });
          }
          if (result.matched) return;
          yield* Effect.sleep(100);
        }
        return yield* new BrowserAutomationTimeoutError({
          message: `T3 Code shell condition did not match within ${timeoutMs}ms.`,
        });
      }),
    );
  });

  return AppAutomationManager.of({
    status,
    show,
    snapshot,
    click,
    type,
    press,
    scroll,
    evaluate,
    waitFor,
  });
}).pipe(Effect.withSpan("AppAutomationManager.make"));

export const layer = Layer.effect(AppAutomationManager, make);
