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

import {
  arrangeSheets,
  cardNumberFor,
  cardNumbersForSlots,
  pairBacksForDuplex,
  recordsPerSheetFor,
  DEFAULT_IMPOSITION_SETTINGS,
} from '@/services/impositionTypes';
import { buildSheetsPdf } from '@/services/impositionService';
import type { ImpositionSettings, NumberingSettings } from '@/services/impositionTypes';

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

describe('imposition — card numbering (record based)', () => {
  const numbering: NumberingSettings = {
    mode: 'per-sheet',
    position: 'bottom-right',
    fontSize: 6,
    color: '#000000',
    margin: 2,
    prefix: '#',
    start: 1,
  };
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
    numbering,
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

  it('per-sheet restarts 1…N on every sheet', () => {
    const perSheet = 5;
    expect(cardNumbersForSlots([0, 1, 2, 3, 4], numbering, perSheet)).toEqual([1, 2, 3, 4, 5]);
    // Records 5–9 are on the NEXT sheet and start over at 1.
    expect(cardNumbersForSlots([5, 6, 7, 8, 9], numbering, perSheet)).toEqual([1, 2, 3, 4, 5]);
  });

  it('continuous carries the sequence into the next sheet', () => {
    const continuous: NumberingSettings = { ...numbering, mode: 'continuous' };
    expect(cardNumbersForSlots([0, 1, 2, 3, 4], continuous, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(cardNumbersForSlots([5, 6, 7, 8, 9], continuous, 5)).toEqual([6, 7, 8, 9, 10]);
  });

  it('honours start and none', () => {
    expect(cardNumberFor({ ...numbering, start: 21 }, 0, 5)).toBe(21);
    expect(cardNumberFor({ ...numbering, mode: 'none', start: 21 }, 3, 5)).toBeNull();
  });

  it('gives a record\u2019s front and back the same number on one sheet', () => {
    const fronts = Array.from({ length: 4 }, () => mockCanvas());
    const backs = Array.from({ length: 4 }, () => mockCanvas());
    const layout = { columns: 2, rows: 4, perSheet: 8 };
    const perSheetRecords = recordsPerSheetFor(layout, 'interleaved', true);
    expect(perSheetRecords).toBe(4);

    const recordIndices = fronts.map((_, index) => index);
    const indexSheets = arrangeSheets(
      recordIndices,
      recordIndices,
      layout,
      'interleaved',
      false
    );
    const numbers = cardNumbersForSlots(
      indexSheets[0] ?? [],
      numbering,
      perSheetRecords
    );
    // Slot 0 = front of record 0, slot 2 = its back directly below.
    expect(numbers[0]).toBe(1);
    expect(numbers[2]).toBe(1);
    // Slot 1 = front of record 1, slot 3 = its back.
    expect(numbers[1]).toBe(2);
    expect(numbers[3]).toBe(2);
    // The arranged cards themselves occupy those same slots.
    const sheets = arrangeSheets(fronts, backs, layout, 'interleaved', false);
    expect(sheets[0]?.[0]).toBe(fronts[0]);
    expect(sheets[0]?.[2]).toBe(backs[0]);
  });

  it('gives a record\u2019s front and back the same number on separate sheets', () => {
    const fronts = Array.from({ length: 4 }, () => mockCanvas());
    const backs = Array.from({ length: 4 }, () => mockCanvas());
    const layout = { columns: 2, rows: 2, perSheet: 4 };
    const recordIndices = fronts.map((_, index) => index);
    const indexSheets = arrangeSheets(
      recordIndices,
      recordIndices,
      layout,
      'separate',
      false
    );
    // Sheet 0 = fronts, sheet 1 = backs of the SAME records.
    expect(indexSheets).toHaveLength(2);
    const frontNumbers = cardNumbersForSlots(indexSheets[0] ?? [], numbering, 4);
    const backNumbers = cardNumbersForSlots(indexSheets[1] ?? [], numbering, 4);
    expect(backNumbers).toEqual(frontNumbers);
    expect(frontNumbers).toEqual([1, 2, 3, 4]);

    // The back sheet holds the backs of the same records in the same order.
    const sheets = arrangeSheets(fronts, backs, layout, 'separate', false);
    expect(sheets[0]?.[0]).toBe(fronts[0]);
    expect(sheets[1]?.[0]).toBe(backs[0]);
  });

  it('prints one number per occupied slot, honouring start and prefix', async () => {
    const cards = [mockCanvas(), mockCanvas(), mockCanvas()];
    const settings: ImpositionSettings = {
      ...base,
      numbering: { ...numbering, mode: 'continuous', start: 5 },
    };
    const numbers = cardNumbersForSlots([0, 1, 2], settings.numbering, 12);
    const content = inflateContent(
      await buildSheetsPdf([cards], settings, {}, [numbers])
    );
    expect(content).toContain('(#5) Tj');
    expect(content).toContain('(#6) Tj');
    expect(content).toContain('(#7) Tj');
    expect(content).not.toContain('(#8) Tj'); // only 3 cards
  });

  it('prints no numbers when the mode is none', async () => {
    const settings: ImpositionSettings = {
      ...base,
      numbering: { ...numbering, mode: 'none' },
    };
    const numbers = cardNumbersForSlots([0, 1], settings.numbering, 12);
    const content = inflateContent(
      await buildSheetsPdf([[mockCanvas(), mockCanvas()]], settings, {}, [numbers])
    );
    expect(content).not.toContain('Tj');
  });
});
