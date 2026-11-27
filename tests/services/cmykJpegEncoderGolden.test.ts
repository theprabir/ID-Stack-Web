/**
 * Golden test for the CMYK JPEG encoder (v0.7.7).
 *
 * The v0.7.7 rewrite replaced Maps, `number[]` output and per-call table
 * building with typed-array tables and a bit accumulator. A faster encoder is
 * worthless — dangerous, even — if it shifts a single byte of print output, so
 * these hashes were captured from the v0.7.6 implementation before the
 * rewrite. Any change in encoded bytes fails this test.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeCmykJpegBytes } from '@/services/cmykJpegEncoder';

/** Deterministic pseudo-random bytes (so the fixture never depends on Math.random) */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

/** Build the interleaved CMYK sample buffer for one fixture */
function buildSamples(
  width: number,
  height: number,
  seed: number,
  kind: 'gradient' | 'noise'
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  const random = lcg(seed);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (kind === 'gradient') {
        data[index] = Math.round((x * 255) / (width - 1));
        data[index + 1] = Math.round((y * 255) / (height - 1));
        data[index + 2] = (x * 7 + y * 13) & 255;
        data[index + 3] = (x + y) & 255;
      } else {
        data[index] = random();
        data[index + 1] = random();
        data[index + 2] = random();
        data[index + 3] = random();
      }
    }
  }
  return data;
}

interface Fixture {
  name: string;
  width: number;
  height: number;
  seed: number;
  kind: 'gradient' | 'noise';
  quality: number;
  bytes: number;
  sha256: string;
}

/**
 * v0.7.6 output: byte length + SHA-256, captured before the rewrite.
 * The 1011×638 case is the real card size used by the imposed-sheet export.
 */
const FIXTURES: Fixture[] = [
  {
    name: 'gradient 32×24 @ q92',
    width: 32,
    height: 24,
    seed: 1,
    kind: 'gradient',
    quality: 92,
    bytes: 1126,
    sha256: 'ba51b4aef66bf472d3e49e49bda3ed0c47245339c29c9f730dfc491fa843348c',
  },
  {
    name: 'noise 17×9 @ q50 (odd clamp edges)',
    width: 17,
    height: 9,
    seed: 7,
    kind: 'noise',
    quality: 50,
    bytes: 945,
    sha256: 'dc19f05be23fb8fd1914ed6dc2966eb4f803617c2726733a1439bf52617b5f66',
  },
  {
    name: 'gradient 1011×638 @ q92 (real card size)',
    width: 1011,
    height: 638,
    seed: 3,
    kind: 'gradient',
    quality: 92,
    bytes: 379270,
    sha256: '642bbd5dba80d1eb6d816db429d88346a509397a35df51d5f147e01e46d87fd3',
  },
  {
    name: 'noise 64×64 @ q100',
    width: 64,
    height: 64,
    seed: 11,
    kind: 'noise',
    quality: 100,
    bytes: 25958,
    sha256: 'a7673e66cc9d525054b9be555b765c0eafae54c7b647209c989fd49dd1bd881e',
  },
];

describe('CMYK JPEG encoder — output is byte-identical to v0.7.6', () => {
  for (const fixture of FIXTURES) {
    it(`encodes ${fixture.name}`, () => {
      const samples = buildSamples(fixture.width, fixture.height, fixture.seed, fixture.kind);
      const bytes = encodeCmykJpegBytes(
        samples,
        fixture.width,
        fixture.height,
        fixture.quality
      );
      expect(bytes.length).toBe(fixture.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
    });
  }

  it('keeps the four-component SOF0 and Adobe APP14 transform=0 header', () => {
    const samples = buildSamples(8, 8, 5, 'noise');
    const bytes = encodeCmykJpegBytes(samples, 8, 8, 92);

    // SOI
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    // APP14 'Adobe' with transform 0 at offset 14 (2 marker + 12 payload)
    expect(bytes[2]).toBe(0xff);
    expect(bytes[3]).toBe(0xee);
    expect(String.fromCharCode(...bytes.slice(6, 11))).toBe('Adobe');
    expect(bytes[17]).toBe(0x00);
    // SOF0 declares four components
    const sof = bytes.indexOf(0xff);
    expect(sof).toBe(0);
    const sof0 = findMarker(bytes, 0xc0);
    expect(bytes[sof0 + 4 + 5]).toBe(4);
  });
});

/** Offset of the first byte after a marker's length field */
function findMarker(bytes: Uint8Array, marker: number): number {
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === marker) return index;
  }
  throw new Error(`Marker FF${marker.toString(16)} not found.`);
}
