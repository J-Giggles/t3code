// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerDictateButton, type ComposerDictateButtonState } from "./ComposerDictateButton";

function renderButton(opts: {
  state: ComposerDictateButtonState;
  unavailableTooltip?: string | null;
  onClick?: () => void;
  preserveComposerFocusOnPointerDown?: boolean;
}) {
  const onClick = opts.onClick ?? (() => {});
  const result = render(
    <ComposerDictateButton
      state={opts.state}
      onClick={onClick}
      {...(opts.unavailableTooltip !== undefined
        ? { unavailableTooltip: opts.unavailableTooltip }
        : {})}
      {...(opts.preserveComposerFocusOnPointerDown !== undefined
        ? { preserveComposerFocusOnPointerDown: opts.preserveComposerFocusOnPointerDown }
        : {})}
    />,
  );
  const button = result.container.querySelector("button");
  if (!button) throw new Error("button not rendered");
  return { ...result, button };
}

describe("ComposerDictateButton", () => {
  it("renders an enabled idle button labeled to start dictation", () => {
    const { button } = renderButton({ state: "idle" });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Start dictation");
    expect(button.dataset.state).toBe("idle");
  });

  it("renders a disabled busy button while requesting permission", () => {
    const { button } = renderButton({ state: "requesting-permission" });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Dictation busy");
    expect(button.dataset.state).toBe("requesting-permission");
  });

  it("renders a recording button labeled to stop and pulses", () => {
    const { button } = renderButton({ state: "recording" });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Stop dictation");
    expect(button.className).toMatch(/animate-pulse/);
    expect(button.dataset.state).toBe("recording");
  });

  it("renders a disabled busy button while stopping", () => {
    const { button } = renderButton({ state: "stopping" });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Dictation busy");
    expect(button.dataset.state).toBe("stopping");
  });

  it("renders an enabled error button labeled to retry", () => {
    const { button } = renderButton({ state: "error" });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Retry dictation");
    expect(button.dataset.state).toBe("error");
  });

  it("renders a disabled unavailable button with the tooltip text", () => {
    const tooltip = "Dictation requires a secure context (HTTPS).";
    const { button } = renderButton({
      state: "unavailable-secure-context",
      unavailableTooltip: tooltip,
    });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(tooltip);
    expect(button.getAttribute("title")).toBe(tooltip);
    expect(button.dataset.state).toBe("unavailable-secure-context");
  });

  it("invokes onClick when clicked in an enabled state", () => {
    const onClick = vi.fn();
    const { button } = renderButton({ state: "idle", onClick });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClick when disabled (busy)", () => {
    const onClick = vi.fn();
    const { button } = renderButton({ state: "requesting-permission", onClick });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls preventDefault on pointerdown by default to preserve composer focus", () => {
    const { button } = renderButton({ state: "idle" });
    const event = new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(
      "pointerdown",
      { bubbles: true, cancelable: true },
    );
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not preventDefault when preserveComposerFocusOnPointerDown is false", () => {
    const { button } = renderButton({
      state: "idle",
      preserveComposerFocusOnPointerDown: false,
    });
    const event = new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(
      "pointerdown",
      { bubbles: true, cancelable: true },
    );
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
