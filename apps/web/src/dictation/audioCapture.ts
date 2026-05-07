export interface AudioCaptureOptions {
  workletUrl: string;
  onFrame: (frame: ArrayBuffer) => void;
}

export interface AudioCaptureHandle {
  stop(): Promise<void>;
}

export async function startAudioCapture(options: AudioCaptureOptions): Promise<AudioCaptureHandle> {
  if (!window.isSecureContext) {
    throw new Error(
      "Dictation requires a secure context (HTTPS). Try `tailscale serve` for local dev.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Dictation requires a browser with mediaDevices.getUserMedia support.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(options.workletUrl);
  const sourceNode = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, "pcm-resampler");
  workletNode.port.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) options.onFrame(event.data);
  };
  sourceNode.connect(workletNode);

  const handle: AudioCaptureHandle & { __workletNode?: AudioWorkletNode } = {
    async stop() {
      workletNode.port.onmessage = null;
      try {
        workletNode.disconnect();
      } catch {}
      try {
        sourceNode.disconnect();
      } catch {}
      for (const track of stream.getTracks()) track.stop();
      await ctx.close();
    },
  };
  handle.__workletNode = workletNode;
  return handle;
}
