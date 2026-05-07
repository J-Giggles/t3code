import { describe, expect, it } from "vitest";
import { resampleFloat32ToInt16 } from "./pcmResampler.ts";

function sineFloat32(sampleRate: number, freqHz: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return out;
}

describe("resampleFloat32ToInt16", () => {
  it("reduces 48kHz to 16kHz with expected sample count", () => {
    const input = sineFloat32(48_000, 1000, 1);
    const out = resampleFloat32ToInt16(input, 48_000, 16_000);
    expect(out.length).toBeGreaterThanOrEqual(15_990);
    expect(out.length).toBeLessThanOrEqual(16_010);
  });

  it("clamps Float32 values outside [-1, 1] before quantizing", () => {
    const input = new Float32Array([2, -2, 0]);
    const out = resampleFloat32ToInt16(input, 16_000, 16_000);
    expect(out[0]).toBe(32_767);
    expect(out[1]).toBe(-32_768);
    expect(out[2]).toBe(0);
  });

  it("upsample 8kHz to 16kHz roughly doubles sample count", () => {
    const input = sineFloat32(8_000, 500, 0.1);
    const out = resampleFloat32ToInt16(input, 8_000, 16_000);
    expect(out.length).toBeGreaterThanOrEqual(1590);
    expect(out.length).toBeLessThanOrEqual(1610);
  });

  it("preserves ~0.5 amplitude (Int16 ≈ 16384) for a 1kHz sine", () => {
    const input = sineFloat32(48_000, 1000, 0.5);
    const out = resampleFloat32ToInt16(input, 48_000, 16_000);
    let max = 0;
    for (const sample of out) max = Math.max(max, Math.abs(sample));
    expect(max).toBeGreaterThan(15_500);
    expect(max).toBeLessThan(17_000);
  });
});
