/**
 * Encode an ArrayBuffer as a base64 string.
 *
 * For small buffers (≤ a few KB — dictation frames are 1.6 KB) this naive
 * `String.fromCharCode` + `btoa` path is fast enough and avoids pulling in a
 * dependency. If profiling later shows this is a hotspot, swap for a
 * lookup-table implementation.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Build the binary string in chunks to avoid call-stack issues on very
  // large buffers (8K stack limit on some engines).
  const chunkSize = 0x8000; // 32 KB
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}
