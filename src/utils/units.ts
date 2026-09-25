import { MM_PER_INCH } from '@/constants/units';

/**
 * Canvas rendering resolution (px per mm). 300 DPI print quality:
 * 300 px / 25.4 mm ≈ 11.811 px per mm.
 */
export const PX_PER_MM_300DPI = 300 / MM_PER_INCH;

/** On-screen editing scale: 1 mm = 3.7795 px (96 DPI CSS) */
export const PX_PER_MM_SCREEN = 96 / MM_PER_INCH;

/**
 * Convert millimetres to screen pixels for the editing canvas.
 * @param mm - Length in millimetres
 * @returns Length in CSS pixels
 */
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM_SCREEN;
}

/**
 * Convert screen pixels to millimetres.
 * @param px - Length in CSS pixels
 * @returns Length in millimetres
 */
export function pxToMm(px: number): number {
  return px / PX_PER_MM_SCREEN;
}

/**
 * Convert millimetres to 300-DPI print pixels.
 * @param mm - Length in millimetres
 * @returns Length in pixels at 300 DPI
 */
export function mmToPrintPx(mm: number): number {
  return mm * PX_PER_MM_300DPI;
}

/**
 * Convert millimetres to inches.
 * @param mm - Length in millimetres
 * @returns Length in inches
 */
export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH;
}

/**
 * Convert inches to millimetres.
 * @param inch - Length in inches
 * @returns Length in millimetres
 */
export function inchToMm(inch: number): number {
  return inch * MM_PER_INCH;
}

/**
 * Format a millimetre value for display in the configured unit system.
 * @param mm - Length in millimetres
 * @param unit - 'mm' | 'inch'
 * @param fractionDigits - Decimal places (default 1)
 * @returns Formatted string, e.g. "85.6 mm" or "3.37 in"
 */
export function formatLength(mm: number, unit: 'mm' | 'inch', fractionDigits = 1): string {
  if (unit === 'inch') {
    return `${mmToInch(mm).toFixed(fractionDigits + 1)} in`;
  }
  return `${mm.toFixed(fractionDigits)} mm`;
}
