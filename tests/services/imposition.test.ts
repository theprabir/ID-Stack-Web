import { describe, it, expect } from 'vitest';
import {
  toPoints,
  computeSheetLayout,
  resolvePageSizePt,
  DEFAULT_IMPOSITION_SETTINGS,
  type ImpositionSettings,
} from '@/services/impositionTypes';

/** Clone the defaults with overrides for compact test setups */
function makeSettings(overrides: Partial<ImpositionSettings> = {}): ImpositionSettings {
  return {
    ...DEFAULT_IMPOSITION_SETTINGS,
    ...overrides,
    paper: { ...DEFAULT_IMPOSITION_SETTINGS.paper, ...overrides.paper },
    numbering: { ...DEFAULT_IMPOSITION_SETTINGS.numbering, ...overrides.numbering },
  };
}

describe('imposition — unit conversion', () => {
  it('converts mm/cm/in/pt to points correctly', () => {
    expect(toPoints(25.4, 'mm')).toBeCloseTo(72, 5);
    expect(toPoints(2.54, 'cm')).toBeCloseTo(72, 5);
    expect(toPoints(1, 'in')).toBeCloseTo(72, 5);
    expect(toPoints(72, 'pt')).toBeCloseTo(72, 5);
  });

  it('resolves preset and custom paper sizes with landscape swap', () => {
    const a4 = resolvePageSizePt({ preset: 'a4', width: 0, height: 0, landscape: false }, 'mm');
    expect(a4.width).toBeCloseTo(595.276, 2);
    expect(a4.height).toBeCloseTo(841.89, 2);

    const a4Landscape = resolvePageSizePt({ preset: 'a4', width: 0, height: 0, landscape: true }, 'mm');
    expect(a4Landscape.width).toBeCloseTo(841.89, 2);
    expect(a4Landscape.height).toBeCloseTo(595.276, 2);

    const custom = resolvePageSizePt({ preset: 'custom', width: 100, height: 50, landscape: false }, 'mm');
    expect(custom.width).toBeCloseTo(283.465, 2);
    expect(custom.height).toBeCloseTo(141.732, 2);
  });
});

describe('imposition — sheet layout math', () => {
  it('fits the expected CR80 grid on A4 with default spacing', () => {
    const layout = computeSheetLayout(makeSettings());
    expect(layout).not.toBeNull();
    if (!layout) return;
    // A4 = 210×297 mm; cell = 86+6=92 × 54+6=60 mm + 4 gap + 8 margin.
    // Columns: floor((210-16+4)/(92+4)) = floor(198/96) = 2
    // Rows:    floor((297-16+4)/(60+4)) = floor(285/64) = 4
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(4);
    expect(layout.perSheet).toBe(8);
    expect(layout.slots).toHaveLength(8);
  });

  it('centres the grid on the page', () => {
    const layout = computeSheetLayout(makeSettings());
    if (!layout) throw new Error('layout should exist');
    const gridWidth = layout.columns * (layout.cardWidthPt + 2 * layout.bleedPt) + (layout.columns - 1) * (4 * (72 / 25.4));
    expect(layout.originX).toBeCloseTo((layout.pageWidth - gridWidth) / 2, 1);
  });

  it('returns null when nothing fits', () => {
    // Enormous cards on A4.
    const layout = computeSheetLayout(makeSettings({ cardWidth: 500, cardHeight: 500 }));
    expect(layout).toBeNull();
  });

  it('respects zero bleed and gap', () => {
    const layout = computeSheetLayout(
      makeSettings({
        unit: 'pt',
        bleed: 0,
        gap: 0,
        margin: 0,
        cardWidth: 100,
        cardHeight: 50,
      })
    );
    if (!layout) throw new Error('layout should exist');
    // A4 = 595.276 × 841.89 pt; cells 100×50 pt → 5 cols, 16 rows.
    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(16);
  });

  it('produces row-major slot order with correct pitch', () => {
    const settings = makeSettings({ cardWidth: 50, cardHeight: 50, bleed: 0, gap: 0, margin: 0 });
    const layout = computeSheetLayout(settings);
    if (!layout) throw new Error('layout should exist');
    const first = layout.slots[0];
    const second = layout.slots[1];
    expect(first && second ? second.x - first.x : 0).toBeCloseTo(50 * (72 / 25.4), 1);
    expect(first?.column).toBe(1);
    expect(first?.row).toBe(1);
  });
});
