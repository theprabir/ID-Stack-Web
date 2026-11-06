import { describe, it, expect } from 'vitest';
import {
  artworkSizePt,
  computeSheetLayout,
  DEFAULT_IMPOSITION_SETTINGS,
  type ImpositionSettings,
} from '@/services/impositionTypes';
import { cardPlacementPt } from '@/services/impositionService';

/** A4 portrait, millimetres, 3 mm bleed / 4 mm gap / 8 mm margin (defaults) */
function mmSettings(): ImpositionSettings {
  return { ...DEFAULT_IMPOSITION_SETTINGS, unit: 'mm' };
}

const PT_PER_MM = 72 / 25.4;

describe('artworkSizePt (v0.7.4)', () => {
  it('is derived from pixels and DPI without any rounding', () => {
    // 600 × 1000 px at 300 dpi = 2 in × 3.333 in = 144 × 240 pt exactly.
    expect(artworkSizePt(600, 1000, 300)).toEqual({ width: 144, height: 240 });
    // A non-round DPI must not be rounded to 2 decimals either.
    const odd = artworkSizePt(1039, 653, 600);
    expect(odd.width).toBe((1039 * 72) / 600);
    expect(odd.height).toBe((653 * 72) / 600);
  });

  it('swaps the axes for a landscape card and ignores a 0 DPI', () => {
    expect(artworkSizePt(600, 1000, 300, 'landscape')).toEqual({ width: 240, height: 144 });
    // Fallback DPI of 72 keeps 1 px = 1 pt.
    expect(artworkSizePt(86, 54, 0)).toEqual({ width: 86, height: 54 });
  });
});

describe('computeSheetLayout with an exact card size (v0.7.4)', () => {
  it('uses the artwork size verbatim — trim slots are never rescaled', () => {
    const exact = artworkSizePt(600, 1000, 300); // 144 × 240 pt
    const layout = computeSheetLayout(mmSettings(), undefined, exact);
    expect(layout).not.toBeNull();
    expect(layout!.cardWidthPt).toBe(144);
    expect(layout!.cardHeightPt).toBe(240);
    // Every trim slot is exactly the artwork size and sits one bleed inside
    // its cell, so the bleed only reserves space around the trim box.
    for (const slot of layout!.slots) {
      expect(slot.width).toBe(144);
      expect(slot.height).toBe(240);
    }
    const bleedPt = 3 * PT_PER_MM;
    const gapPt = 4 * PT_PER_MM;
    expect(layout!.bleedPt).toBeCloseTo(bleedPt, 10);
    expect(layout!.pitchX).toBeCloseTo(144 + 2 * bleedPt + gapPt, 10);
    expect(layout!.pitchY).toBeCloseTo(240 + 2 * bleedPt + gapPt, 10);

    const [first] = layout!.slots;
    expect(first!.x).toBeCloseTo(layout!.originX + bleedPt, 10);
    expect(first!.y).toBeCloseTo(layout!.originY + bleedPt, 10);
  });

  it('differs from the rounded user setting, proving the exact value wins', () => {
    // 86 mm card setting vs a 602 px @ 300 dpi artwork (144.48 pt ≈ 50.98 mm).
    const rounded = computeSheetLayout(mmSettings());
    const exact = computeSheetLayout(mmSettings(), undefined, artworkSizePt(602, 1000, 300));
    expect(rounded!.cardWidthPt).toBeCloseTo(86 * PT_PER_MM, 6);
    expect(exact!.cardWidthPt).toBe((602 * 72) / 300);
    expect(exact!.cardWidthPt).not.toBeCloseTo(rounded!.cardWidthPt, 6);
  });

  it('returns null when the exact card cannot fit the paper', () => {
    expect(computeSheetLayout(mmSettings(), undefined, artworkSizePt(5000, 6000, 300))).toBeNull();
  });
});

describe('cardPlacementPt with an exact card size (v0.7.4)', () => {
  const layout = computeSheetLayout(mmSettings(), undefined, artworkSizePt(600, 1000, 300))!;
  const slot = layout.slots[0]!;

  it('places the image exactly on the trim slot — scale 1.000', () => {
    const placement = cardPlacementPt(
      { width: 600, height: 1000 },
      slot,
      layout.pageHeight,
      300,
      { width: 144, height: 240 }
    );
    expect(placement.width).toBe(slot.width);
    expect(placement.height).toBe(slot.height);
    expect(placement.x).toBe(slot.x);
    // PDF y is bottom-up: the image bottom is the page height minus the slot's
    // lower edge.
    expect(placement.y).toBe(layout.pageHeight - (slot.y + slot.height));
    // Ratio check: no up/down scaling at all, in either axis.
    expect((placement.width * 300) / 72 / 600).toBe(1);
    expect((placement.height * 300) / 72 / 1000).toBe(1);
  });

  it('ignores the rendered pixel dimensions once the exact size is known', () => {
    const odd = cardPlacementPt(
      { width: 1237, height: 1013 },
      slot,
      layout.pageHeight,
      300,
      { width: 144, height: 240 }
    );
    expect(odd).toEqual({
      x: slot.x,
      y: layout.pageHeight - (slot.y + slot.height),
      width: slot.width,
      height: slot.height,
    });
  });

  it('falls back to the natural size (centred) without an exact size', () => {
    const legacy = cardPlacementPt({ width: 600, height: 1000 }, slot, layout.pageHeight, 300);
    expect(legacy.width).toBeCloseTo(144, 10);
    expect(legacy.height).toBeCloseTo(240, 10);
    // The 86 mm slot is wider than the 144 pt card, so it is centred inside it.
    const expectedX = slot.x + (slot.width - 144) / 2;
    expect(legacy.x).toBeCloseTo(expectedX, 10);
  });
});
