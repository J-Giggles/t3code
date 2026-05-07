import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "./base64.ts";

describe("arrayBufferToBase64", () => {
  it("encodes an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("encodes a small known sequence", () => {
    // Bytes 0x66 0x6f 0x6f → "foo" → "Zm9v"
    const buf = new Uint8Array([0x66, 0x6f, 0x6f]).buffer;
    expect(arrayBufferToBase64(buf)).toBe("Zm9v");
  });

  it("encodes a 1600-byte zeroed buffer (matches typical dictation frame size)", () => {
    const buf = new ArrayBuffer(1600);
    const encoded = arrayBufferToBase64(buf);
    // Decoding back should yield the same length.
    const decoded = atob(encoded);
    expect(decoded.length).toBe(1600);
  });

  it("preserves arbitrary byte values", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = arrayBufferToBase64(bytes.buffer);
    const decoded = atob(encoded);
    expect(decoded.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(decoded.charCodeAt(i)).toBe(i);
    }
  });
});
