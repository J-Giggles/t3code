/// <reference types="@types/audioworklet" />
import { resampleFloat32ToInt16 } from "./pcmResampler.ts";

const FRAME_MS = 50;
const TARGET_RATE = 16_000;
const SAMPLES_PER_FRAME = (TARGET_RATE * FRAME_MS) / 1000; // 800

class PcmResamplerProcessor extends AudioWorkletProcessor {
  private buffer: Int16Array = new Int16Array(0);

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const resampled = resampleFloat32ToInt16(channel, sampleRate, TARGET_RATE);
    this.buffer = concatInt16(this.buffer, resampled);
    while (this.buffer.length >= SAMPLES_PER_FRAME) {
      const frame = this.buffer.slice(0, SAMPLES_PER_FRAME);
      this.buffer = this.buffer.slice(SAMPLES_PER_FRAME);
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}

function concatInt16(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

registerProcessor("pcm-resampler", PcmResamplerProcessor);
