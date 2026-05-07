import {
  ThreadId,
  WS_METHODS,
  type DictationStreamEvent,
  type VcsStatusLocalResult,
  type VcsStatusRemoteResult,
  type VcsStatusStreamEvent,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("./wsTransport", () => ({
  WsTransport: class WsTransport {
    dispose = vi.fn(async () => undefined);
    reconnect = vi.fn(async () => undefined);
    request = vi.fn();
    requestStream = vi.fn();
    subscribe = vi.fn(() => () => undefined);
  },
}));

import { createWsRpcClient } from "./wsRpcClient";
import { type WsTransport } from "./wsTransport";

const baseLocalStatus: VcsStatusLocalResult = {
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef: false,
  refName: "feature/demo",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
};

const baseRemoteStatus: VcsStatusRemoteResult = {
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

describe("wsRpcClient", () => {
  it("reduces vcs status stream events into flat status snapshots", () => {
    const subscribe = vi.fn(<TValue>(_connect: unknown, listener: (value: TValue) => void) => {
      for (const event of [
        {
          _tag: "snapshot",
          local: baseLocalStatus,
          remote: null,
        },
        {
          _tag: "remoteUpdated",
          remote: baseRemoteStatus,
        },
        {
          _tag: "localUpdated",
          local: {
            ...baseLocalStatus,
            hasWorkingTreeChanges: true,
          },
        },
      ] satisfies VcsStatusStreamEvent[]) {
        listener(event as TValue);
      }
      return () => undefined;
    });

    const transport = {
      dispose: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
      request: vi.fn(),
      requestStream: vi.fn(),
      subscribe,
    } satisfies Pick<
      WsTransport,
      "dispose" | "reconnect" | "request" | "requestStream" | "subscribe"
    >;

    const client = createWsRpcClient(transport as unknown as WsTransport);
    const listener = vi.fn();

    client.vcs.onStatus({ cwd: "/repo" }, listener);

    expect(listener.mock.calls).toEqual([
      [
        {
          ...baseLocalStatus,
          hasUpstream: false,
          aheadCount: 0,
          behindCount: 0,
          aheadOfDefaultCount: 0,
          pr: null,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
          hasWorkingTreeChanges: true,
        },
      ],
    ]);
  });

  it("exposes dictation methods that proxy through the transport", () => {
    const request = vi.fn();
    const subscribe = vi.fn(
      (
        _connect: unknown,
        _listener: (event: unknown) => void,
        _options?: { readonly tag?: string },
      ) =>
        () =>
          undefined,
    );
    const transport = {
      dispose: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
      request,
      requestStream: vi.fn(),
      subscribe,
    };

    const client = createWsRpcClient(transport as unknown as WsTransport);

    expect(typeof client.dictation.start).toBe("function");
    expect(typeof client.dictation.audioFrame).toBe("function");
    expect(typeof client.dictation.stop).toBe("function");
    expect(typeof client.dictation.subscribe).toBe("function");

    void client.dictation.start({
      threadId: ThreadId.make("thread-1"),
      language: null,
    });
    void client.dictation.audioFrame({
      sessionId: "session-1",
      seq: 0,
      pcm: "AAAA",
    });
    void client.dictation.stop({
      sessionId: "session-1",
      reason: "user",
    });
    const events: DictationStreamEvent[] = [];
    const dispose = client.dictation.subscribe((event) => {
      events.push(event);
    });

    expect(request).toHaveBeenCalledTimes(3);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0]?.[2]).toMatchObject({
      tag: WS_METHODS.subscribeDictation,
    });
    expect(typeof dispose).toBe("function");
  });
});
