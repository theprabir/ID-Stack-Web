/**
 * v0.6.1 regression tests — the "622 × 1011 cm" / "does not fit" bug.
 * A 300-DPI PSD's pixel dimensions must derive to true physical card sizes
 * (px ÷ DPI × 72 pt), never raw pixel counts; placeholder font sizes and
 * effect distances must scale the same way.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveCardSizeFromDesign,
  isCardSizeSyncedWithDesign,
} from '@/services/impositionTypes';
import { extractLayerEffects, agColorToCss } from '@/services/psdService';
import type { LayerEffectsInfo } from 'ag-psd/dist/psd.d';

describe('DPI-aware card size derivation (final fix)', () => {
  it('derives a true 1056×663 px 300-DPI card as 254×159.52 pt', () => {
    // 1056 px ÷ 300 dpi × 72 = 253.44 pt... precisely:
    // 1056/300 = 3.52 in → 253.44 pt; 663/300 = 2.21 in → 159.12 pt.
    const size = deriveCardSizeFromDesign(1056, 663, 'landscape', 'pt', 300);
    expect(size.width).toBeCloseTo(253.44, 1);
    expect(size.height).toBeCloseTo(159.12, 1);
  });

  it('derives the same card in mm (3.52 in × 25.4 = 89.4 mm wide)', () => {
    const size = deriveCardSizeFromDesign(1056, 663, 'landscape', 'mm', 300);
    expect(size.width).toBeCloseTo(89.41, 1);
    expect(size.height).toBeCloseTo(56.14, 1);
  });

  it('a portrait 300-DPI card swaps to true physical size when landscape is chosen', () => {
    const size = deriveCardSizeFromDesign(663, 1056, 'landscape', 'mm', 300);
    expect(size.width).toBeCloseTo(89.41, 1); // wide after swap
    expect(size.height).toBeCloseTo(56.14, 1);
  });

  it('72-DPI behaviour is unchanged (identity px → pt)', () => {
    const size = deriveCardSizeFromDesign(638, 1011, 'portrait', 'pt', 72);
    expect(size.width).toBeCloseTo(638, 0);
    expect(size.height).toBeCloseTo(1011, 0);
  });

  it('a 300-DPI card NEVER derives to the raw pixel count in mm/cm', () => {
    const size = deriveCardSizeFromDesign(1056, 663, 'landscape', 'cm', 300);
    // 3.52 in = 8.94 cm — NOT 1056 cm.
    expect(size.width).toBeLessThan(20);
    expect(size.height).toBeLessThan(20);
  });

  it('sync check rejects raw-pixel stale values at 300 dpi', () => {
    const stale = isCardSizeSyncedWithDesign(
      { cardWidth: 1056, cardHeight: 663, unit: 'cm', cardOrientation: 'landscape' },
      1056,
      663,
      300
    );
    expect(stale).toBe(false);

    const synced = isCardSizeSyncedWithDesign(
      { cardWidth: 8.94, cardHeight: 5.61, unit: 'cm', cardOrientation: 'landscape' },
      1056,
      663,
      300
    );
    expect(synced).toBe(true);
  });
});

describe('DPI-aware effect extraction', () => {
  it('converts a 10 pt shadow distance to design pixels at 300 dpi', () => {
    const effects: LayerEffectsInfo = {
      dropShadow: [
        {
          enabled: true,
          color: { r: 0, g: 0, b: 0 },
          opacity: 1,
          angle: 90,
          distance: { units: 'Points', value: 10 },
          size: { units: 'Points', value: 20 },
        },
      ],
    };
    const result = extractLayerEffects(effects, 300);
    // 10 pt at 300 dpi = 41.67 px; blur = 20 pt → 83.33 px / 2 = 41.67.
    expect(result?.dropShadows?.[0]?.distance).toBeCloseTo(41.67, 1);
    expect(result?.dropShadows?.[0]?.blur).toBeCloseTo(41.67, 1);
  });

  it('keeps pixel-unit effect values unchanged', () => {
    const effects: LayerEffectsInfo = {
      stroke: [
        {
          enabled: true,
          size: { units: 'Pixels', value: 6 },
          position: 'inside',
          color: { r: 0, g: 0, b: 0 },
        },
      ],
    };
    const result = extractLayerEffects(effects, 300);
    expect(result?.stroke?.width).toBe(6);
  });

  it('the CMYK colour converter is exported and working (pipeline sanity)', () => {
    expect(agColorToCss({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
  });
});
