import { describe, it, expect, vi } from 'vitest';

// LittleCMS (WASM) and the ICC/font assets cannot run under jsdom — the same
// stub set the other imposition tests use.
vi.mock('@kittl/little-cms', () => ({
  initWasm: async () => ({ error: null, value: undefined }),
  cmsCreate_sRGBProfile: () => ({ error: null, value: {} }),
  cmsOpenProfileFromMem: () => ({ error: null, value: {} }),
  cmsCreateTransform: () => ({ error: null, value: {} }),
  cmsDoTransform: (_t: unknown, _rgb: Uint8Array, pixelCount: number): Uint8Array =>
    new Uint8Array(pixelCount * 4),
  cmsDeleteTransform: () => undefined,
  cmsCloseProfile: () => undefined,
  CmsIntent: { Percepttual: 1 },
}));
vi.mock('@kittl/little-cms/formats', () => ({ TYPE_RGB_8: 0, TYPE_CMYK_8: 0 }));
vi.mock('@kittl/little-cms/flags', () => ({ FLAGS_NOOPTIMIZE: 0 }));
vi.mock('@/assets/profiles/default_cmyk.icc?url', () => ({ default: 'mock://default_cmyk.icc' }));
vi.mock('@/assets/fonts/arimo-regular.ttf?url', () => ({ default: 'mock://arimo.ttf' }));
globalThis.fetch = vi.fn(
  async () => new Response(new ArrayBuffer(8), { status: 200 })
) as unknown as typeof fetch;

import { PDFDocument } from 'pdf-lib';
import { SheetJobWriter } from '@/services/sheetJobWriter';
import { artworkSizePt, computeSheetLayout, DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';
import type { EncodedCard } from '@/services/impositionService';

/** A fake card: real structure, 1×1 fake JPEG bytes (nothing decodes them) */
function encodedCard(bytes = 4): EncodedCard {
  return { bytes: new Uint8Array(bytes).fill(0x11), width: 600, height: 1000 };
}

/** Large fake card used to reach the per-part byte budget quickly */
function bigCard(): EncodedCard {
  return encodedCard(1024 * 1024);
}

/** 2 columns × 2 rows = 4 cards per sheet A4 layout */
function fourUpLayout() {
  const settings = {
    ...DEFAULT_IMPOSITION_SETTINGS,
    unit: 'mm' as const,
    paper: { preset: 'a4' as const, width: 210, height: 297, landscape: false },
  };
  const cardSizePt = artworkSizePt(600, 1000, 300); // 144 × 240 pt
  const layout = computeSheetLayout(settings, undefined, cardSizePt);
  if (!layout) throw new Error('test layout does not fit');
  return { settings, layout, cardSizePt };
}

/** Page count of a finished part */
async function pageCount(blob: Blob): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  return doc.getPageCount();
}

describe('SheetJobWriter (v0.7.4) — bounded-memory sheet output', () => {
  it('writes a normal job as ONE PDF named after the job', async () => {
    const { settings, layout, cardSizePt } = fourUpLayout();
    const writer = await SheetJobWriter.create({
      settings,
      layout,
      cardSizePt,
      dpi: 300,
      totalSheets: 2,
      baseName: 'sheet_Print',
    });

    for (let page = 0; page < 2; page += 1) {
      for (let slot = 0; slot < layout.perSheet; slot += 1) writer.putNext(encodedCard());
      await writer.flushPage();
    }

    const parts = await writer.finish();
    expect(parts).toHaveLength(1);
    expect(parts[0]!.fileName).toBe('sheet_Print.pdf');
    expect(await pageCount(parts[0]!.blob)).toBe(2);
    expect(writer.sheetCount).toBe(2);
  });

  it('rotates into numbered parts once the byte budget is reached', async () => {
    const { settings, layout, cardSizePt } = fourUpLayout();
    const writer = await SheetJobWriter.create({
      settings,
      layout,
      cardSizePt,
      dpi: 300,
      totalSheets: 6,
      baseName: 'big',
      // The minimum budget is 8 MB; two 1 MB cards per page means 4 pages
      // fill a part.
      partBudgetBytes: 8 * 1024 * 1024,
    });

    for (let page = 0; page < 6; page += 1) {
      for (let slot = 0; slot < 2; slot += 1) writer.putNext(bigCard());
      await writer.flushPage();
    }

    const parts = await writer.finish();
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]!.fileName).toBe(`big_part1of${parts.length}.pdf`);
    expect(parts[parts.length - 1]!.fileName).toBe(
      `big_part${parts.length}of${parts.length}.pdf`
    );
    // No sheet is lost or duplicated across the rotated documents.
    let pages = 0;
    for (const part of parts) pages += await pageCount(part.blob);
    expect(pages).toBe(6);
    expect(writer.sheetCount).toBe(6);
  });

  it('closes back faces with the part that owns their records', async () => {
    const { settings, layout, cardSizePt } = fourUpLayout();
    const writer = await SheetJobWriter.create({
      // Long-edge duplex mirrors the column on the back sheet.
      settings: { ...settings, duplex: true, arrangement: 'separate' as const },
      layout,
      cardSizePt,
      dpi: 300,
      totalSheets: 2,
      hasBackFaces: true,
      baseName: 'sheet_Front_Back',
    });

    for (let slot = 0; slot < 2; slot += 1) writer.putNext(encodedCard());
    writer.putBack(encodedCard());
    writer.putBack(encodedCard());
    await writer.flushPage();

    const parts = await writer.finish();
    expect(parts).toHaveLength(1);
    // One front page + one back page in the same document.
    expect(await pageCount(parts[0]!.blob)).toBe(2);
  });

  it('returns no file when nothing was placed', async () => {
    const { settings, layout, cardSizePt } = fourUpLayout();
    const writer = await SheetJobWriter.create({
      settings,
      layout,
      cardSizePt,
      totalSheets: 0,
    });
    expect(await writer.finish()).toEqual([]);
  });
});
