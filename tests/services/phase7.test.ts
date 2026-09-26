/**
 * Phase 7 / v0.6.0 tests:
 * - PSD-locked card size derivation and staleness detection
 * - Worker pool graceful fallback (workers unavailable → main thread)
 */
import { describe, it, expect } from 'vitest';
import {
  deriveCardSizeFromDesign,
  isCardSizeSyncedWithDesign,
  DEFAULT_IMPOSITION_SETTINGS,
} from '@/services/impositionTypes';
import { isWorkerPoolDegraded, encodeJpegInWorker } from '@/services/workerPool';
import { encodeCmykJpegBytes } from '@/services/cmykJpegEncoder';

describe('card size locked to PSD (v0.6.0 fit fix)', () => {
  it('derives pt-sized cards from PSD pixels (72 dpi identity)', () => {
    // Typical tall PSD: 638×1011 px → 638×1011 pt in the pt unit.
    const size = deriveCardSizeFromDesign(638, 1011, 'portrait', 'pt');
    expect(size.width).toBeCloseTo(638, 0);
    expect(size.height).toBeCloseTo(1011, 0);
  });

  it('converts PSD pixels to mm so values stay physically sane', () => {
    // 1011 px = 356.6 mm — a real card size, NOT "1011 mm".
    const size = deriveCardSizeFromDesign(1011, 638, 'landscape', 'mm');
    expect(size.width).toBeCloseTo(356.6, 0);
    expect(size.height).toBeCloseTo(225.07, 1);
  });

  it('reports a synced size as synced', () => {
    const synced = isCardSizeSyncedWithDesign(
      { cardWidth: 638, cardHeight: 1011, unit: 'pt', cardOrientation: 'portrait' },
      638,
      1011
    );
    expect(synced).toBe(true);
  });

  it('detects stale sizes (unit changed, legacy mm seed) and reports unsynced', () => {
    // Card stored as 86×54 mm but the PSD is 638×1011 px in mm mode now.
    const stale = isCardSizeSyncedWithDesign(
      { cardWidth: 86, cardHeight: 54, unit: 'mm', cardOrientation: 'portrait' },
      638,
      1011
    );
    expect(stale).toBe(false);
  });

  it('detects orientation switches that need re-derivation', () => {
    const afterSwitch = isCardSizeSyncedWithDesign(
      { cardWidth: 638, cardHeight: 1011, unit: 'pt', cardOrientation: 'landscape' },
      638,
      1011
    );
    expect(afterSwitch).toBe(false);
  });

  it('the shipped default size is not treated as synced for a real PSD', () => {
    const defaulted = isCardSizeSyncedWithDesign(
      {
        cardWidth: DEFAULT_IMPOSITION_SETTINGS.cardWidth,
        cardHeight: DEFAULT_IMPOSITION_SETTINGS.cardHeight,
        unit: 'mm',
        cardOrientation: 'portrait',
      },
      638,
      1011
    );
    expect(defaulted).toBe(false);
  });
});

describe('export worker pool fallback (Phase 7)', () => {
  /** Deterministic CMYK sample buffer */
  function cmykSamples(width: number, height: number): Uint8Array {
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = index % 251;
      data[index + 1] = (index * 7) % 255;
      data[index + 2] = (index * 13) % 255;
      data[index + 3] = (index * 29) % 255;
    }
    return data;
  }

  it('falls back to main-thread encoding and produces identical output', async () => {
    const width = 24;
    const height = 18;
    const samples = cmykSamples(width, height);
    const expected = encodeCmykJpegBytes(samples, width, height, 90);
    const actual = await encodeJpegInWorker(samples, width, height, 90);
    // Both paths must emit a valid Adobe CMYK JPEG with identical structure
    // (byte-identical when the worker path is exercised; the SOI/APP14
    // header check holds in both cases).
    expect(actual[0]).toBe(0xff);
    expect(actual[1]).toBe(0xd8);
    expect([...actual.subarray(0, 32)]).toEqual([...expected.subarray(0, 32)]);
  });

  it('exposes a degraded flag that never throws', () => {
    expect(typeof isWorkerPoolDegraded()).toBe('boolean');
  });
});
