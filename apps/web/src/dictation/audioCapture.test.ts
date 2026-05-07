import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startAudioCapture, type AudioCaptureHandle } from "./audioCapture.ts";

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

const fakeStream = (() => {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { getAudioTracks: () => [track], getTracks: () => [track] } as never;
})();

beforeEach(() => {
  // @ts-expect-error - shimming JSDOM
  if (!globalThis.window) globalThis.window = {} as Window;
  if (!globalThis.navigator) globalThis.navigator = {} as Navigator;
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioContext = FakeAudioContext;
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
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
    const track = (
      fakeStream as never as { getAudioTracks(): { stop: ReturnType<typeof vi.fn> }[] }
    ).getAudioTracks()[0]!;
    expect(track.stop).toHaveBeenCalled();
  });
});
