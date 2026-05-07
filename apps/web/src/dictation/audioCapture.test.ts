import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startAudioCapture } from "./audioCapture.ts";

class FakeAudioContext {
  sampleRate = 48_000;
  audioWorklet = { addModule: vi.fn(async () => {}) };
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  close = vi.fn(async () => {});
}
class FakeAudioWorkletNode {
  port = {
    onmessage: null as ((e: MessageEvent<ArrayBuffer>) => void) | null,
    close: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  __endedListeners: Array<() => void>;
}

function createFakeTrack(): FakeTrack {
  const endedListeners: Array<() => void> = [];
  return {
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "ended") endedListeners.push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "ended") {
        const index = endedListeners.indexOf(listener);
        if (index !== -1) endedListeners.splice(index, 1);
      }
    }),
    __endedListeners: endedListeners,
  };
}

let fakeStream: { getAudioTracks: () => FakeTrack[]; getTracks: () => FakeTrack[] };
let fakeTrack: FakeTrack;

beforeEach(() => {
  // @ts-expect-error - shimming JSDOM
  if (!globalThis.window) globalThis.window = {} as Window;
  if (!globalThis.navigator) globalThis.navigator = {} as Navigator;
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioContext = FakeAudioContext;
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  fakeTrack = createFakeTrack();
  fakeStream = { getAudioTracks: () => [fakeTrack], getTracks: () => [fakeTrack] };
  // @ts-expect-error - shimming JSDOM
  globalThis.navigator.mediaDevices = {
    getUserMedia: vi.fn(async () => fakeStream),
  };
  globalThis.window.isSecureContext = true;
});
afterEach(() => vi.restoreAllMocks());

describe("startAudioCapture", () => {
  it("requests mono getUserMedia with EC/NS/AGC enabled", async () => {
    await startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });

  it("rejects when isSecureContext is false", async () => {
    globalThis.window.isSecureContext = false;
    await expect(startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} })).rejects.toThrow(
      /secure context/i,
    );
  });

  it("posts Int16 frames from the worklet to the onFrame callback", async () => {
    const frames: ArrayBuffer[] = [];
    const handle = await startAudioCapture({
      workletUrl: "/x.js",
      onFrame: (frame) => frames.push(frame),
    });
    // simulate worklet posting a frame
    (handle as unknown as { __workletNode: FakeAudioWorkletNode }).__workletNode.port.onmessage?.(
      new MessageEvent("message", { data: new ArrayBuffer(1600) }),
    );
    expect(frames.length).toBe(1);
    expect(frames[0]?.byteLength).toBe(1600);
  });

  it("stop() releases the MediaStream tracks and closes the AudioContext", async () => {
    const handle = await startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} });
    await handle.stop();
    expect(fakeTrack.stop).toHaveBeenCalled();
  });

  it("invokes onTrackEnded when the track fires the ended event", async () => {
    const onTrackEnded = vi.fn();
    await startAudioCapture({
      workletUrl: "/x.js",
      onFrame: () => {},
      onTrackEnded,
    });
    expect(fakeTrack.addEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
    for (const listener of fakeTrack.__endedListeners) listener();
    expect(onTrackEnded).toHaveBeenCalledTimes(1);
  });

  it("debounces multiple ended events so onTrackEnded fires only once", async () => {
    const onTrackEnded = vi.fn();
    await startAudioCapture({
      workletUrl: "/x.js",
      onFrame: () => {},
      onTrackEnded,
    });
    for (const listener of fakeTrack.__endedListeners) {
      listener();
      listener();
    }
    expect(onTrackEnded).toHaveBeenCalledTimes(1);
  });

  it("removes ended listeners on stop()", async () => {
    const handle = await startAudioCapture({
      workletUrl: "/x.js",
      onFrame: () => {},
      onTrackEnded: () => {},
    });
    await handle.stop();
    expect(fakeTrack.removeEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
  });
});
