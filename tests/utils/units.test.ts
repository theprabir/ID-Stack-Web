import { describe, it, expect } from 'vitest';
import { mmToPx, pxToMm, mmToPrintPx, mmToInch, inchToMm, formatLength } from '@/utils/units';

describe('units', () => {
  it('round-trips mm → px → mm', () => {
    const mm = 85.6;
    expect(pxToMm(mmToPx(mm))).toBeCloseTo(mm, 10);
  });

  it('converts mm to inches correctly', () => {
    expect(mmToInch(25.4)).toBeCloseTo(1, 10);
    expect(inchToMm(2)).toBeCloseTo(50.8, 10);
  });

  it('converts mm to 300 DPI print pixels', () => {
    // 25.4 mm at 300 DPI = exactly 300 px
    expect(mmToPrintPx(25.4)).toBeCloseTo(300, 6);
    // CR80 width: 85.6 mm ≈ 1011 px at 300 DPI
    expect(mmToPrintPx(85.6)).toBeCloseTo(1011.02, 1);
  });

  it('formats lengths per unit system', () => {
    expect(formatLength(85.6, 'mm')).toBe('85.6 mm');
    expect(formatLength(25.4, 'inch')).toBe('1.00 in');
  });
});
