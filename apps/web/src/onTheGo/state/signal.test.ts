import { describe, expect, it, vi } from "vitest";

import { createSignal } from "./signal";

describe("Signal", () => {
  it("returns the initial value", () => {
    const signal = createSignal(42);

    expect(signal.value).toBe(42);
  });

  it("updates the current value", () => {
    const signal = createSignal(0);

    signal.set(1);

    expect(signal.value).toBe(1);
  });

  it("notifies subscribers on change with the new value", () => {
    const signal = createSignal("hello");
    const listener = vi.fn();

    signal.subscribe(listener);
    signal.set("goodbye");

    expect(listener).toHaveBeenCalledExactlyOnceWith("goodbye");
  });

  it("does not notify subscribers when the next value is Object.is equal to the current value", () => {
    const value = { id: 1 };
    const signal = createSignal(value);
    const listener = vi.fn();

    signal.subscribe(listener);
    signal.set(value);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const signal = createSignal(0);
    const listener = vi.fn();

    const unsubscribe = signal.subscribe(listener);
    signal.set(1);
    unsubscribe();
    signal.set(2);

    expect(listener).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("uses a stable subscriber snapshot during notification", () => {
    const signal = createSignal(0);
    const listener = vi.fn();
    const unsubscribe = signal.subscribe((value) => {
      unsubscribe();
      listener(value);
    });
    const secondListener = vi.fn();

    signal.subscribe(secondListener);
    signal.set(1);
    signal.set(2);

    expect(listener).toHaveBeenCalledExactlyOnceWith(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
  });
});
