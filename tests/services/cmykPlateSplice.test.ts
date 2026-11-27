/**
 * Byte-identity proof for the CMYK plate splice (v0.7.8).
 *
 * The real ICC transform is per-pixel and deterministic, so a fake transform
 * with the same property is enough to prove the splice: if the spliced buffer
 * equals the full transformation of the same card under an arbitrary
 * deterministic per-pixel transform, it equals it under the ICC transform too.
 * The real transform is additionally compared against a full transform in the
 * running app.
 */
import { describe, expect, it } from 'vitest';
import {
  countChangedPixels,
  spliceCardOntoPlate,
  type CmykPlate,
} from '@/services/cmykPlateSplice';

/** Deterministic, per-pixel, channel-mixing stand-in for the ICC transform */
function fakeTransform(rgb: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count * 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const r = rgb[pixel * 3] ?? 0;
    const g = rgb[pixel * 3 + 1] ?? 0;
    const b = rgb[pixel * 3 + 2] ?? 0;
    out[pixel * 4] = (r + 17) & 0xff;
    out[pixel * 4 + 1] = (g * 3) & 0xff;
    out[pixel * 4 + 2] = b ^ 0x5a;
    out[pixel * 4 + 3] = 255 - ((r + g + b) & 0xff);
  }
  return out;
}

/** Full transform of an RGBA buffer (what the old code path produced) */
function transformAll(rgba: Uint8Array): Uint8Array {
  const count = rgba.length / 4;
  const rgb = new Uint8Array(count * 3);
  for (let pixel = 0; pixel < count; pixel += 1) {
    rgb[pixel * 3] = rgba[pixel * 4] ?? 0;
    rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1] ?? 0;
    rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2] ?? 0;
  }
  return fakeTransform(rgb, count);
}

/** Deterministic RGBA card of the given size */
function makeRgba(width: number, height: number, seed: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  let state = seed >>> 0;
  for (let index = 0; index < rgba.length; index += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    rgba[index] = state >>> 24;
    rgba[index + 1] = (state >>> 16) & 0xff;
    rgba[index + 2] = (state >>> 8) & 0xff;
    rgba[index + 3] = 255;
  }
  return rgba;
}

const WIDTH = 650;
const HEIGHT = 1028;

/**
 * Compare two buffers byte by byte.
 *
 * `expect(a).toEqual(b)` on 2.6 M-element typed arrays spends ~30 s walking
 * every element for its diff report; this loop finds a mismatch in milliseconds
 * and still fails loudly with the offending index.
 */
function expectSameBytes(actual: Uint8Array | undefined, expected: Uint8Array): void {
  expect(actual).toBeDefined();
  const bytes = actual as Uint8Array;
  expect(bytes.length).toBe(expected.length);
  let mismatch = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== expected[index]) {
      mismatch = index;
      break;
    }
  }
  expect(mismatch).toBe(-1);
}

describe('cmykPlateSplice — spliced output equals a full transform', () => {
  it('matches a full transform when ~20 % of pixels change', () => {
    const plateRgba = makeRgba(WIDTH, HEIGHT, 1);
    const plate: CmykPlate = { rgba: plateRgba, cmyk: transformAll(plateRgba) };
    // A card that differs in a contiguous block plus scattered pixels.
    const card = plateRgba.slice();
    for (let y = 120; y < 420; y += 1) {
      for (let x = 40; x < 340; x += 1) {
        const index = (y * WIDTH + x) * 4;
        card[index] = (card[index] ?? 0) ^ 0xff;
      }
    }
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 997) {
      card[pixel * 4 + 1] = (card[pixel * 4 + 1] ?? 0) ^ 0x3c;
    }

    const result = spliceCardOntoPlate(card, plate, fakeTransform);
    expect(result).not.toBeNull();
    expect(result?.changedPixels).toBeGreaterThan(0);
    expectSameBytes(result?.cmyk, transformAll(card));
  });

  it('returns the plate CMYK unchanged when nothing differs', () => {
    const plateRgba = makeRgba(64, 48, 7);
    const plate: CmykPlate = { rgba: plateRgba, cmyk: transformAll(plateRgba) };
    const result = spliceCardOntoPlate(plateRgba.slice(), plate, fakeTransform);
    expect(result?.changedPixels).toBe(0);
    expectSameBytes(result?.cmyk, plate.cmyk);
  });

  it('ignores alpha-only differences (the transform drops alpha)', () => {
    const plateRgba = makeRgba(32, 32, 3);
    const plate: CmykPlate = { rgba: plateRgba, cmyk: transformAll(plateRgba) };
    const card = plateRgba.slice();
    for (let index = 3; index < card.length; index += 4) card[index] = 0;
    const result = spliceCardOntoPlate(card, plate, fakeTransform);
    expect(result?.changedPixels).toBe(0);
    expectSameBytes(result?.cmyk, transformAll(card));
  });

  it('counts differing pixels so the closest plate can be picked', () => {
    const plate = makeRgba(32, 32, 9);
    const card = plate.slice();
    expect(countChangedPixels(card, plate)).toBe(0);
    for (let pixel = 0; pixel < 5; pixel += 1) {
      const index = pixel * 4;
      card[index] = (card[index] ?? 0) ^ 0xff;
    }
    expect(countChangedPixels(card, plate)).toBe(5);
    expect(countChangedPixels(card.subarray(0, 100), plate)).toBeNull();
  });

  it('refuses buffers it cannot splice (caller falls back to a full transform)', () => {
    const plateRgba = makeRgba(16, 16, 5);
    const plate: CmykPlate = { rgba: plateRgba, cmyk: transformAll(plateRgba) };
    // Another card size, a short plate CMYK buffer, a misaligned view.
    expect(spliceCardOntoPlate(new Uint8Array(16 * 16 * 4 - 4), plate, fakeTransform)).toBeNull();
    expect(
      spliceCardOntoPlate(plateRgba.slice(), { ...plate, cmyk: new Uint8Array(8) }, fakeTransform)
    ).toBeNull();
    const padded = new Uint8Array(16 * 16 * 4 + 1);
    padded.set(plateRgba, 1);
    expect(
      spliceCardOntoPlate(padded.subarray(1, 1 + 16 * 16 * 4), plate, fakeTransform)
    ).toBeNull();
  });
});
