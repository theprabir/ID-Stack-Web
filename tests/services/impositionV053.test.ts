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
globalThis.fetch = vi.fn(
  async () => new Response(new ArrayBuffer(8), { status: 200 })
) as unknown as typeof fetch;

import {
  arrangeSheets,
  computeSheetLayout,
  DEFAULT_IMPOSITION_SETTINGS,
  deriveCardSizeFromDesign,
  type ImpositionSettings,
} from '@/services/impositionTypes';
import { buildSheetsPdf } from '@/services/impositionService';

/** Tiny canvas stand-in (geometry only) */
function mockCanvas(width = 60, height = 100): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
  } as unknown as HTMLCanvasElement;
}

function baseSettings(overrides: Partial<ImpositionSettings> = {}): ImpositionSettings {
  return {
    ...DEFAULT_IMPOSITION_SETTINGS,
    unit: 'pt',
    paper: { preset: 'custom', width: 400, height: 600, landscape: false },
    cardWidth: 80,
    cardHeight: 50,
    bleed: 0,
    gap: 10,
    margin: 10,
    cropMarks: false,
    numbering: { ...DEFAULT_IMPOSITION_SETTINGS.numbering, mode: 'none' },
    duplex: false,
    ...overrides,
  };
}

describe('arrangeSheets — interleaved arrangement', () => {
  it('places each back directly below its front on one sheet', () => {
    // 2 rows grid: front rows per sheet = 1, so 1 front row + 1 back row.
    const layout = { columns: 3, rows: 2, perSheet: 6 };
    const fronts = [1, 2, 3].map(() => mockCanvas());
    const backs = [1, 2, 3].map(() => mockCanvas());
    const sheets = arrangeSheets(fronts, backs, layout, 'interleaved', false);

    expect(sheets).toHaveLength(1);
    const placed = sheets[0]!;
    // Row-major slots: 0-2 = fronts, 3-5 = the matching backs.
    expect(placed).toHaveLength(6);
    expect(placed[0]).toBe(fronts[0]);
    expect(placed[1]).toBe(fronts[1]);
    expect(placed[2]).toBe(fronts[2]);
    expect(placed[3]).toBe(backs[0]);
    expect(placed[4]).toBe(backs[1]);
    expect(placed[5]).toBe(backs[2]);
  });

  it('produces multiple sheets with paired rows on each', () => {
    const layout = { columns: 2, rows: 2, perSheet: 4 };
    const fronts = Array.from({ length: 4 }, () => mockCanvas());
    const backs = Array.from({ length: 4 }, () => mockCanvas());
    const sheets = arrangeSheets(fronts, backs, layout, 'interleaved', false);

    expect(sheets).toHaveLength(2);
    // Sheet 1: front0-1 in row 0, back0-1 in row 1.
    expect(sheets[0]![0]).toBe(fronts[0]);
    expect(sheets[0]![1]).toBe(fronts[1]);
    expect(sheets[0]![2]).toBe(backs[0]);
    expect(sheets[0]![3]).toBe(backs[1]);
    // Sheet 2: front2-3 + back2-3.
    expect(sheets[1]![0]).toBe(fronts[2]);
    expect(sheets[1]![3]).toBe(backs[3]);
  });

  it('keeps separate mode as fronts first then backs', () => {
    const layout = { columns: 2, rows: 1, perSheet: 2 };
    const fronts = [0, 1, 2].map(() => mockCanvas());
    const backs = [0, 1, 2].map(() => mockCanvas());
    const sheets = arrangeSheets(fronts, backs, layout, 'separate', false);

    // 2 front sheets then 2 back sheets.
    expect(sheets).toHaveLength(4);
    expect(sheets[0]).toEqual([fronts[0], fronts[1]]);
    expect(sheets[1]).toEqual([fronts[2]]);
    expect(sheets[2]).toEqual([backs[0], backs[1]]);
    expect(sheets[3]).toEqual([backs[2]]);
  });
});

describe('computeSheetLayout — card orientation', () => {
  // Authored card is TALL: 50 wide × 80 high.
  it('swaps width/height for landscape orientation', () => {
    const settings = baseSettings({ cardWidth: 50, cardHeight: 80, cardOrientation: 'landscape' });
    const layout = computeSheetLayout(settings);
    expect(layout).not.toBeNull();
    expect(layout!.cardWidthPt).toBe(80);
    expect(layout!.cardHeightPt).toBe(50);
  });

  it('keeps portrait as authored', () => {
    const settings = baseSettings({ cardWidth: 50, cardHeight: 80, cardOrientation: 'portrait' });
    const layout = computeSheetLayout(settings);
    expect(layout).not.toBeNull();
    expect(layout!.cardWidthPt).toBe(50);
    expect(layout!.cardHeightPt).toBe(80);
  });

  it('fits more portrait cards in a column than landscape', () => {
    const portrait = computeSheetLayout(
      baseSettings({ cardWidth: 50, cardHeight: 80, cardOrientation: 'portrait' })
    );
    const landscape = computeSheetLayout(
      baseSettings({ cardWidth: 50, cardHeight: 80, cardOrientation: 'landscape' })
    );
    // Tall cards fit fewer per row but stack more per column; wide cards the opposite.
    expect(portrait!.columns).toBeGreaterThan(landscape!.columns);
    expect(landscape!.rows).toBeGreaterThanOrEqual(portrait!.rows);
  });
});

describe('deriveCardSizeFromDesign — PSD-based auto card size', () => {
  it('keeps a tall design as-is for portrait', () => {
    // 638×1011 px at 72 dpi → 224.57 × 355.19 pt = same in mm/pt unit values.
    const size = deriveCardSizeFromDesign(638, 1011, 'portrait', 'pt');
    expect(size.width).toBeCloseTo(638, 0);
    expect(size.height).toBeCloseTo(1011, 0);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('swaps a wide design for portrait (taller than wide result)', () => {
    const size = deriveCardSizeFromDesign(1012, 638, 'portrait', 'pt');
    expect(size.width).toBeCloseTo(638, 0);
    expect(size.height).toBeCloseTo(1012, 0);
  });

  it('keeps a wide design as-is for landscape', () => {
    const size = deriveCardSizeFromDesign(1012, 638, 'landscape', 'pt');
    expect(size.width).toBeCloseTo(1012, 0);
    expect(size.height).toBeCloseTo(638, 0);
  });

  it('swaps a tall design for landscape (wider than tall result)', () => {
    const size = deriveCardSizeFromDesign(638, 1011, 'landscape', 'pt');
    expect(size.width).toBeCloseTo(1011, 0);
    expect(size.height).toBeCloseTo(638, 0);
  });

  it('converts pixel size into the active unit (mm at 72 dpi)', () => {
    // 720 px = 10 in = 254 mm.
    const size = deriveCardSizeFromDesign(720, 720, 'portrait', 'mm');
    expect(size.width).toBeCloseTo(254, 0);
    expect(size.height).toBeCloseTo(254, 0);
  });

  it('preserves aspect exactly (no rounding drift beyond 2 decimals)', () => {
    const size = deriveCardSizeFromDesign(1000, 637, 'landscape', 'pt');
    const aspectBefore = 1000 / 637;
    const aspectAfter = size.width / size.height;
    expect(aspectAfter).toBeCloseTo(aspectBefore, 3);
  });
});

describe('buildSheetsPdf — aspect-preserving placement', () => {
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

  it('letterboxes a portrait image inside a landscape slot without distortion', async () => {
    // Card box 80×50 (landscape); image 60×100 (portrait, aspect 0.6).
    // Contain-fit into the bleed box (80×50): scale = min(80/60, 50/100)
    // = 0.5 → drawn 30×50, centred horizontally.
    const settings = baseSettings({ cardOrientation: 'landscape' });
    const content = inflateContent(await buildSheetsPdf([[mockCanvas(60, 100)]], settings));
    const draw = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im0_0 Do Q/.exec(content);
    expect(draw).not.toBeNull();
    const [, width, height] = draw as unknown as string[];
    expect(Number(width)).toBeCloseTo(30, 0);
    expect(Number(height)).toBeCloseTo(50, 0);
  });

  it('fills the slot exactly when the aspect matches (no scaling surprises)', async () => {
    // Card box 80×50; image authored with the same 8:5 aspect (800×500 px).
    const settings = baseSettings({ cardOrientation: 'landscape' });
    const content = inflateContent(await buildSheetsPdf([[mockCanvas(800, 500)]], settings));
    const draw = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im0_0 Do Q/.exec(content);
    expect(draw).not.toBeNull();
    const [, width, height] = draw as unknown as string[];
    expect(Number(width)).toBeCloseTo(80, 0);
    expect(Number(height)).toBeCloseTo(50, 0);
  });
});
