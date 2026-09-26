import { describe, it, expect, vi } from 'vitest';
import { inflate } from 'pako';

// Mock LittleCMS (WASM cannot run under jsdom) with a deterministic sRGB→CMYK map.
vi.mock('@kittl/little-cms', () => ({
  initWasm: async () => ({ error: null, value: undefined }),
  cmsCreate_sRGBProfile: () => ({ error: null, value: {} }),
  cmsOpenProfileFromMem: () => ({ error: null, value: {} }),
  cmsCreateTransform: () => ({ error: null, value: {} }),
  cmsDoTransform: (_t: unknown, rgb: Uint8Array, pixelCount: number): Uint8Array => {
    const out = new Uint8Array(pixelCount * 4);
    for (let p = 0; p < pixelCount; p += 1) {
      out[p * 4] = 255 - (rgb[p * 3] ?? 0);
      out[p * 4 + 1] = 255 - (rgb[p * 3 + 1] ?? 0);
      out[p * 4 + 2] = 255 - (rgb[p * 3 + 2] ?? 0);
      out[p * 4 + 3] = 0;
    }
    return { error: null, value: out } as unknown as Uint8Array;
  },
  cmsDeleteTransform: () => undefined,
  cmsCloseProfile: () => undefined,
  CmsIntent: { Percepttual: 1 },
}));
vi.mock('@kittl/little-cms/formats', () => ({ TYPE_RGB_8: 0, TYPE_CMYK_8: 0 }));
vi.mock('@kittl/little-cms/flags', () => ({ FLAGS_NOOPTIMIZE: 0 }));
vi.mock('@/assets/profiles/default_cmyk.icc?url', () => ({ default: 'mock://default_cmyk.icc' }));
vi.mock('@/assets/fonts/arimo-regular.ttf?url', () => ({ default: 'mock://arimo.ttf' }));
globalThis.fetch = vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })) as unknown as typeof fetch;

import { buildSheetsPdf } from '@/services/impositionService';
import { DEFAULT_IMPOSITION_SETTINGS, type ImpositionSettings } from '@/services/impositionTypes';

/** Create a mock canvas of the given pixel size filled with a solid colour */
function mockCanvas(width: number, height: number, gray: number): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < pixels.length; p += 4) {
    pixels[p] = gray; pixels[p + 1] = gray; pixels[p + 2] = gray; pixels[p + 3] = 255;
  }
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
  } as unknown as HTMLCanvasElement;
}

function ptSettings(): ImpositionSettings {
  return {
    ...DEFAULT_IMPOSITION_SETTINGS,
    unit: 'pt',
    paper: { preset: 'custom', width: 400, height: 300, landscape: false },
    cardWidth: 90,
    cardHeight: 50,
    bleed: 0,
    gap: 10,
    margin: 10,
    cropMarks: true,
    numbering: { mode: 'per-sheet', position: 'bottom-right', fontSize: 8, color: '#333333', prefix: 'S' },
    duplex: false,
  };
}

describe('impositionService — sheet PDF assembly', () => {
  it('builds one page per sheet with the right page size and image count', async () => {
    // 400×300 pt page, 90×50 cards, 10 gap/margin → cols: floor((400-20+10)/100)=3,
    // rows: floor((300-20+10)/60)=4 → 12 per sheet.
    const settings = ptSettings();
    const cards = Array.from({ length: 14 }, (_, i) => mockCanvas(90, 50, (i * 17) % 255));
    const bytes = await buildSheetsPdf([cards.slice(0, 12), cards.slice(12)], settings, 3);

    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    // Two pages.
    const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(2);
    // MediaBox = 400×300.
    expect(text).toContain('/MediaBox [ 0 0 400 300 ]');
    // 12 + 2 = 14 image XObjects.
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(14);
    // GTS_PDFX output intent present.
    expect(text).toContain('GTS_PDFX');
  });

  it('draws the sheet number with prefix and position in the content stream', async () => {
    const settings = ptSettings();
    const bytes = await buildSheetsPdf([[]], settings, 7);
    const text = Buffer.from(bytes).toString('latin1');
    // Content streams are Flate-compressed; inflate every stream and search.
    const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1] ?? '');
    const inflated = streams
      .map((s) => {
        try {
          return Buffer.from(inflate(Buffer.from(s, 'latin1'))).toString('latin1');
        } catch {
          return s; // uncompressed stream (e.g. the ICC mock bytes)
        }
      })
      .join('\n');
    expect(inflated).toContain('(S7) Tj');
  });

  it('includes crop mark path operators when enabled', async () => {
    const settings = ptSettings();
    const bytes = await buildSheetsPdf([[mockCanvas(90, 50, 128)]], settings);
    const text = Buffer.from(bytes).toString('latin1');
    const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1] ?? '');
    const inflated = streams
      .map((s) => {
        try {
          return Buffer.from(inflate(Buffer.from(s, 'latin1'))).toString('latin1');
        } catch {
          return s;
        }
      })
      .join('\n');
    // Crop marks are stroked line segments ("m ... l S").
    expect(inflated).toMatch(/m [\d.]+ [\d.]+ l S/);
  });
});
