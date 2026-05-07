import { describe, expect, it, vi } from "vitest";

import { abortable, AbortError } from "./abortable";

describe("AbortablePromise", () => {
  it("resolves with the value when not aborted", async () => {
    const p = abortable<number>((resolve) => {
      resolve(42);
    });

    await expect(p).resolves.toBe(42);
  });

  it("throws AbortError when aborted before resolution", async () => {
    const p = abortable<number>(() => {
      // Intentionally left pending until abort is called.
    });

    p.abort();

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("calls the cleanup function on abort", async () => {
    const cleanup = vi.fn();
    const p = abortable<number>(() => cleanup);

    p.abort();

    expect(cleanup).toHaveBeenCalledOnce();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("is idempotent on multiple abort calls", async () => {
    const cleanup = vi.fn();
    const p = abortable<number>(() => cleanup);

    p.abort();
    p.abort();

    expect(cleanup).toHaveBeenCalledOnce();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("can abort after resolving with a pending promise", async () => {
    const cleanup = vi.fn();
    const pending = new Promise<number>(() => {
      // Intentionally pending so abort remains meaningful after resolution adoption.
    });
    const p = abortable<number>((resolve) => {
      resolve(pending);
      return cleanup;
    });

    p.abort();

    expect(cleanup).toHaveBeenCalledOnce();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("ignores later executor rejections after resolving with a promise", async () => {
    let resolvePending!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      resolvePending = resolve;
    });
    const p = abortable<number>((resolve, reject) => {
      resolve(pending);
      reject(new Error("late failure"));
    });

    resolvePending(7);

    await expect(p).resolves.toBe(7);
  });

  it("still rejects with AbortError when cleanup throws", async () => {
    const p = abortable<number>(() => {
      return () => {
        throw new Error("cleanup failed");
      };
    });

    expect(() => p.abort()).not.toThrow();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});
