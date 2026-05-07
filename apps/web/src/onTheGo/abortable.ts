export class AbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortError";
  }
}

export type AbortablePromise<T> = Promise<T> & { abort: () => void };

type AbortableExecutor<T> = (
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void,
) => void | (() => void);

const rejectBeforeInitialized = (_reason?: unknown): void => {};

export function abortable<T>(executor: AbortableExecutor<T>): AbortablePromise<T> {
  let cleanup: (() => void) | undefined;
  let rejectPromise: (reason?: unknown) => void = rejectBeforeInitialized;
  let settled = false;
  let executorSettled = false;

  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;

    const resolveOnce = (value: T | PromiseLike<T>) => {
      if (executorSettled) return;
      executorSettled = true;

      if (isPromiseLike(value)) {
        void Promise.resolve(value).then(
          (resolvedValue) => {
            if (settled) return;
            settled = true;
            resolve(resolvedValue);
          },
          (reason) => {
            if (settled) return;
            settled = true;
            reject(reason);
          },
        );
        return;
      }

      settled = true;
      resolve(value);
    };

    const rejectOnce = (reason?: unknown) => {
      if (executorSettled) return;
      executorSettled = true;
      settled = true;
      reject(reason);
    };

    cleanup = executor(resolveOnce, rejectOnce) ?? undefined;
  }) as AbortablePromise<T>;

  promise.abort = () => {
    if (settled) return;

    settled = true;
    executorSettled = true;
    try {
      cleanup?.();
    } catch {
      // Abort is best-effort cleanup; the returned promise still settles as aborted.
    } finally {
      rejectPromise(new AbortError());
    }
  };

  return promise;
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
