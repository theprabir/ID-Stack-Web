import { describe, it, expect, vi } from 'vitest';
import { inflate } from 'pako';

// Mock LittleCMS (WASM cannot run under jsdom) with a deterministic
// sRGB → CMYK mapping (C=255−R, M=255−G, Y=255−B, K=0) so the orientation of
// the stored rows stays unambiguous. The factory must be self-contained —
// vi.mock calls are hoisted above all top-level code.
vi.mock('@kittl/little-cms', () => ({
  initWasm: async () => ({ error: null, value: undefined }),
  cmsCreate_sRGBProfile: () => ({ error: null, value: {} }),
  cmsOpenProfileFromMem: () => ({ error: null, value: {} }),
  cmsCreateTransform: () => ({ error: null, value: {} }),
  cmsDoTransform: (_transform: unknown, rgb: Uint8Array, pixelCount: number): Uint8Array => {
    const out = new Uint8Array(pixelCount * 4);
    for (let p = 0; p < pixelCount; p += 1) {
      out[p * 4] = 255 - (rgb[p * 3] ?? 0);
      out[p * 4 + 1] = 255 - (rgb[p * 3 + 1] ?? 0);
      out[p * 4 + 2] = 255 - (rgb[p * 3 + 2] ?? 0);
      out[p * 4 + 3] = 0;
    }
    // The service expects the little-cms Result shape { error, value }.
    return { error: null, value: out } as unknown as Uint8Array;
  },
  cmsDeleteTransform: () => undefined,
  cmsCloseProfile: () => undefined,
  CmsIntent: { Percepttual: 1 },
}));
vi.mock('@kittl/little-cms/formats', () => ({ TYPE_RGB_8: 0, TYPE_CMYK_8: 0 }));
vi.mock('@kittl/little-cms/flags', () => ({ FLAGS_NOOPTIMIZE: 0 }));
// Stub the profile fetch (jsdom cannot resolve Vite's ?url asset imports).
vi.mock('@/assets/profiles/default_cmyk.icc?url', () => ({ default: 'mock://default_cmyk.icc' }));
globalThis.fetch = vi.fn(async () =>
  new Response(new ArrayBuffer(8), { status: 200 })
) as unknown as typeof fetch;

import { encodeCmykPdf } from '@/services/cmykExportService';

/**
 * Regression test for the vertical-flip bug: PDF image data must be stored
 * top-row-first, exactly like canvas ImageData. An asymmetric image
 * (top = red, bottom = blue) makes any row inversion unmistakable.
 */
describe('cmykExportService — PDF image orientation', () => {
  it('stores the canvas top row as the first image row', async () => {
    const width = 4;
    const height = 4;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (y < height / 2) {
          pixels[offset] = 255; pixels[offset + 1] = 0; pixels[offset + 2] = 0; pixels[offset + 3] = 255; // red
        } else {
          pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 255; pixels[offset + 3] = 255; // blue
        }
      }
    }
    const canvas = {
      width,
      height,
      getContext: () => ({ getImageData: () => ({ data: pixels }) }),
    } as unknown as HTMLCanvasElement;

    const bytes = await encodeCmykPdf(canvas);

    // Extract the image XObject stream and inflate it.
    const text = Buffer.from(bytes).toString('latin1');
    const imageDict = text.indexOf('/Subtype /Image');
    const streamKw = text.indexOf('\nstream\n', imageDict);
    const dataStart = streamKw + '\nstream\n'.length;
    const endIdx = text.indexOf('\nendstream', dataStart);
    const img = inflate(bytes.subarray(dataStart, endIdx));

    expect(img.length).toBe(width * height * 4);

    // With the mock transform, red (255,0,0) → C=0,M=255,Y=255 and
    // blue (0,0,255) → C=255,M=255,Y=0. So the FIRST stored row must have
    // LOW cyan ink and the LAST row HIGH cyan ink if orientation is correct.
    const cyanOfRow = (row: number): number[] => {
      const rowStart = row * width * 4;
      const values: number[] = [];
      for (let x = 0; x < width; x += 1) values.push(img[rowStart + x * 4] ?? 0);
      return values;
    };
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const firstRowCyan = avg(cyanOfRow(0));
    const lastRowCyan = avg(cyanOfRow(height - 1));

    expect(firstRowCyan).toBeLessThan(lastRowCyan);
  });
});
