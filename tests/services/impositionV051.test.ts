import { describe, it, expect, vi } from 'vitest';
import { inflate } from 'pako';

// --- LittleCMS mock (WASM cannot run under jsdom) ---
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
vi.mock('@/assets/profiles/default_cmyk.icc?url', () => ({ default: 'mock://icc' }));
vi.mock('@/assets/fonts/arimo-regular.ttf?url', () => ({ default: 'mock://a.ttf' }));
vi.mock('@/assets/fonts/arimo-bold.ttf?url', () => ({ default: 'mock://b.ttf' }));
vi.mock('@/assets/fonts/arimo-italic.ttf?url', () => ({ default: 'mock://i.ttf' }));
vi.mock('@/assets/fonts/arimo-bolditalic.ttf?url', () => ({ default: 'mock://bi.ttf' }));
globalThis.fetch = vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })) as unknown as typeof fetch;

import { pairBacksForDuplex, DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';
import { buildSheetsPdf } from '@/services/impositionService';
import type { ImpositionSettings } from '@/services/impositionTypes';

/** Tiny canvas stand-in (geometry only; contents are irrelevant here) */
function mockCanvas(width = 90, height = 50): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
  } as unknown as HTMLCanvasElement;
}

describe('imposition — duplex back pairing', () => {
  it('mirrors each row for long-edge duplex (3 columns)', () => {
    // 6 fronts, 2 rows × 3 columns per sheet.
    const fronts = Array.from({ length: 6 }, () => mockCanvas());
    const backs = pairBacksForDuplex(fronts, 6, 3);
    // Front slot 0 (row 0, col 0) pairs with back slot 2 (row 0, col 2).
    expect(backs[2]).toBe(fronts[0]);
    // Front slot 1 (row 0, col 1) stays centre.
    expect(backs[1]).toBe(fronts[1]);
    // Front slot 2 (row 0, col 2) pairs with back slot 0.
    expect(backs[0]).toBe(fronts[2]);
    // Second row unchanged mapping per column mirror: 3↔5, 4↔4, 5↔3.
    expect(backs[5]).toBe(fronts[3]);
    expect(backs[4]).toBe(fronts[4]);
    expect(backs[3]).toBe(fronts[5]);
  });

  it('keeps a single column unchanged', () => {
    const fronts = [mockCanvas(), mockCanvas()];
    const backs = pairBacksForDuplex(fronts, 2, 1);
    expect(backs[0]).toBe(fronts[0]);
    expect(backs[1]).toBe(fronts[1]);
  });
});

describe('imposition — per-slot card numbering', () => {
  const base: ImpositionSettings = {
    ...DEFAULT_IMPOSITION_SETTINGS,
    unit: 'pt',
    paper: { preset: 'custom', width: 400, height: 300, landscape: false },
    cardWidth: 90,
    cardHeight: 50,
    bleed: 0,
    gap: 10,
    margin: 10,
    cropMarks: false,
    numbering: { ...DEFAULT_IMPOSITION_SETTINGS.numbering, mode: 'none' },
    cardNumbers: {
      enabled: true,
      position: 'bottom-right',
      fontSize: 6,
      color: '#000000',
      margin: 2,
      prefix: '#',
      start: 5,
    },
    duplex: false,
  };

  function inflateContent(bytes: Uint8Array): string {
    const text = Buffer.from(bytes).toString('latin1');
    const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1] ?? '');
    return streams
      .map((s) => {
        try {
          return Buffer.from(inflate(Buffer.from(s, 'latin1'))).toString('latin1');
        } catch {
          return s;
        }
      })
      .join('\n');
  }

  it('prints one number per occupied slot, honouring start and prefix', async () => {
    const cards = [mockCanvas(), mockCanvas(), mockCanvas()];
    const content = inflateContent(await buildSheetsPdf([cards], base));
    expect(content).toContain('(#5) Tj');
    expect(content).toContain('(#6) Tj');
    expect(content).toContain('(#7) Tj');
    expect(content).not.toContain('(#8) Tj'); // only 3 cards
  });

  it('numbers all slots when the sheet is full', async () => {
    // 400×300 pt, 90×50 cards, 10 gap → 3 cols × 4 rows = 12 slots.
    const cards = Array.from({ length: 12 }, () => mockCanvas());
    const content = inflateContent(await buildSheetsPdf([cards], base));
    expect(content).toContain('(#16) Tj'); // 5 + 12 - 1 = 16
    expect(content).not.toContain('(#17) Tj');
  });
});
