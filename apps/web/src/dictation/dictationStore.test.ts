import { describe, expect, it } from "vitest";
import { createDictationStore } from "./dictationStore.ts";

describe("dictationStore", () => {
  it("starts in idle", () => {
    const store = createDictationStore();
    expect(store.read().state).toBe("idle");
  });

  it("idle -> requesting-permission -> recording on grant", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    expect(store.read().state).toBe("requesting-permission");
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    expect(store.read().state).toBe("recording");
    const snapshot = store.read();
    if (snapshot.state !== "recording") throw new Error("expected recording");
    expect(snapshot.sessionId).toBe("s1");
  });

  it("idle -> error on permission deny", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "permission-denied" });
    expect(store.read().state).toBe("error");
  });

  it("recording -> stopping -> idle on user stop", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    store.dispatch({ type: "request-stop", reason: "user" });
    expect(store.read().state).toBe("stopping");
    store.dispatch({ type: "session-stopped" });
    expect(store.read().state).toBe("idle");
  });

  it("recording -> error on backend error", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    store.dispatch({ type: "backend-error", code: "child-crashed", message: "bye" });
    expect(store.read().state).toBe("error");
  });

  it("ignores illegal transitions in idle", () => {
    const store = createDictationStore();
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    expect(store.read().state).toBe("idle");
  });
});
