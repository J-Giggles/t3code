export type Signal<T> = {
  readonly value: T;
  set(next: T): void;
  subscribe(listener: (value: T) => void): () => void;
};

export function createSignal<T>(initial: T): Signal<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get value() {
      return current;
    },
    set(next) {
      if (Object.is(next, current)) return;

      current = next;
      for (const listener of Array.from(listeners)) {
        listener(current);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
