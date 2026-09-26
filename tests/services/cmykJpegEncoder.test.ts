import { describe, it, expect } from 'vitest';
import { encodeCmykJpegBytes } from '@/services/cmykJpegEncoder';
// jpeg-js's DECODER supports 4-component Adobe CMYK (transform=0 → CMYK).
import { decode } from 'jpeg-js';

/** Build a deterministic interleaved CMYK test image */
function buildTestImage(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      data[p] = (x * 255) / Math.max(1, width - 1); // C gradient
      data[p + 1] = (y * 255) / Math.max(1, height - 1); // M gradient
      data[p + 2] = 128; // Y constant
      data[p + 3] = ((x + y) % 2) * 255; // K checkerboard
    }
  }
  return data;
}

/** Find a marker segment in a JPEG stream and return the byte after its length field */
function findSegment(bytes: Uint8Array, marker: number): number {
  let offset = 2; // skip SOI
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('Malformed JPEG: expected a marker.');
    const found = bytes[offset + 1];
    if (found === marker) return offset + 4;
    if (found === 0xda) throw new Error(`Marker 0x${marker.toString(16)} not found before SOS.`);
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += 2 + length;
  }
  throw new Error('Malformed JPEG: ran out of markers.');
}

describe('cmykJpegEncoder — 4-component Adobe CMYK', () => {
  it('writes a valid 4-component SOF0 with APP14 transform=0', () => {
    const jpeg = encodeCmykJpegBytes(buildTestImage(24, 16), 24, 16, 90);
    // APP14 transform byte
    const app14 = findSegment(jpeg, 0xee);
    expect(jpeg[app14 + 11]).toBe(0x00); // transform = 0 (CMYK)
    // SOF0: precision 8, 4 components
    const sof = findSegment(jpeg, 0xc0);
    expect(jpeg[sof]).toBe(8); // precision
    expect((jpeg[sof + 1] ?? 0) * 256 + (jpeg[sof + 2] ?? 0)).toBe(16); // height
    expect((jpeg[sof + 3] ?? 0) * 256 + (jpeg[sof + 4] ?? 0)).toBe(24); // width
    expect(jpeg[sof + 5]).toBe(4); // nrofcomponents
    expect(jpeg[sof + 6]).toBe(1); // C id
    expect(jpeg[sof + 15]).toBe(4); // K id (after 3 components × 3 bytes)
    // Ends with EOI
    expect(jpeg[jpeg.length - 2]).toBe(0xff);
    expect(jpeg[jpeg.length - 1]).toBe(0xd9);
  });

  it('produces a stream the jpeg-js decoder parses as 4-component CMYK', () => {
    const width = 32;
    const height = 32;
    const jpeg = encodeCmykJpegBytes(buildTestImage(width, height), width, height, 90);
    const decoded = decode(jpeg, { useTArray: true, maxMemoryUsageInMB: 64 });
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    // Decoder output is RGBA (it converts Adobe CMYK → RGBA internally).
    expect(decoded.data.length).toBe(width * height * 4);
    // Round-trip semantics: the decoder converts Adobe CMYK → RGBA, so
    // all-zero CMYK (paper white) must come out near RGB white…
    const whiteSource = new Uint8Array(width * height * 4); // all zeros = white in CMYK
    const whiteDecoded = decode(
      encodeCmykJpegBytes(whiteSource, width, height, 90),
      { useTArray: true, maxMemoryUsageInMB: 64 }
    );
    const white = whiteDecoded.data;
    for (let p = 0; p < width * height * 4; p += 1) {
      expect(white[p] ?? 0).toBeGreaterThan(232); // RGB near 255; alpha is 255 too
    }
    // …and full-key black must come out near RGB black.
    const blackSource = new Uint8Array(width * height * 4);
    for (let p = 3; p < blackSource.length; p += 4) blackSource[p] = 255; // K = 100%
    const blackDecoded = decode(
      encodeCmykJpegBytes(blackSource, width, height, 90),
      { useTArray: true, maxMemoryUsageInMB: 64 }
    );
    const black = blackDecoded.data;
    for (let p = 0; p < width * height * 4; p += 1) {
      if (p % 4 === 3) continue; // alpha byte is always 255
      expect(black[p] ?? 0).toBeLessThan(24); // lossy but close to 0
    }
  });

  it('clamps edge blocks correctly on non-multiple-of-8 dimensions', () => {
    const jpeg = encodeCmykJpegBytes(buildTestImage(10, 7), 10, 7, 85);
    const decoded = decode(jpeg, { useTArray: true, maxMemoryUsageInMB: 64 });
    expect(decoded.width).toBe(10);
    expect(decoded.height).toBe(7);
  });
});
