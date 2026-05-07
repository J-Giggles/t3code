export interface AudioCaptureOptions {
  workletUrl: string;
  onFrame: (frame: ArrayBuffer) => void;
  onTrackEnded?: () => void;
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
  const sinkNode = ctx.createGain();
  sinkNode.gain.value = 0;
  workletNode.port.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) options.onFrame(event.data);
  };
  sourceNode.connect(workletNode);
  workletNode.connect(sinkNode);
  sinkNode.connect(ctx.destination);
  if (ctx.state === "suspended") await ctx.resume();

  const trackEndedListeners: Array<{ track: MediaStreamTrack; listener: () => void }> = [];
  if (options.onTrackEnded) {
    const fire = options.onTrackEnded;
    let fired = false;
    const onceListener = () => {
      if (fired) return;
      fired = true;
      fire();
    };
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", onceListener);
      trackEndedListeners.push({ track, listener: onceListener });
    }
  }

  const handle: AudioCaptureHandle & { __workletNode?: AudioWorkletNode } = {
    async stop() {
      workletNode.port.onmessage = null;
      for (const { track, listener } of trackEndedListeners) {
        track.removeEventListener("ended", listener);
      }
      trackEndedListeners.length = 0;
      try {
        workletNode.disconnect();
      } catch {}
      try {
        sinkNode.disconnect();
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
