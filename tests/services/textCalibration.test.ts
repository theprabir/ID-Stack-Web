/**
 * v0.6.3 regression tests — placeholder text self-calibration.
 *
 * The engine-data unit contract (fontSize = points) proved unreliable for
 * real-world PSDs. The fix calibrates each text layer's font size against
 * Photoshop's OWN rasterized pixels of that layer (the ground truth).
 *
 * These tests forge ag-psd Layer objects with controlled raster pixels and
 * verify extractText's calibration end-to-end through the public surface.
 */
import { describe, it, expect } from 'vitest';
import type { Layer, LayerTextData } from 'ag-psd/dist/psd.d';

/** Build a fake canvas whose getImageData returns the given alpha rows */
function fakeCanvasWithInk(
  width: number,
  height: number,
  inkTop: number,
  inkBottom: number
): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = inkTop; y <= inkBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * 4 + 3] = 255; // opaque
    }
  }
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data, width, height }),
    }),
  } as unknown as HTMLCanvasElement;
}

function textLayer(overrides: Partial<Layer> = {}): Layer {
  const text: LayerTextData = {
    text: 'Sue Smith',
    style: {
      font: { name: 'ArialMT', script: 0, type: 0, synthetic: 0 },
      fontSize: 12,
      fillColor: { r: 0, g: 0, b: 0 },
    },
  };
  return { name: 'Name', text, ...overrides } as Layer;
}

describe('placeholder text self-calibration', () => {
  it('a layer WITHOUT pixels keeps the engine-data derived size (300 dpi points conversion)', async () => {
    const { extractTextForTest } = await import('@/services/psdService');
    const layer = textLayer(); // no canvas
    const info = extractTextForTest(layer.text!, 300, layer);
    // 12 pt at 300 dpi = 12/72×300 = 50 px (v0.6.1 conversion, unchanged)
    expect(info?.fontSize).toBeCloseTo(50, 0);
  });

  it('a single-line raster calibrates the size to match its ink height', async () => {
    const { extractTextForTest } = await import('@/services/psdService');
    // Raster ink is 60 px tall; the mock measurement font (test setup:
    // measureText = len*6, no real glyph raster) returns no ink either, so
    // the reference falls back to 75 → 60×100/75 = 80 px.
    const layer = textLayer({ canvas: fakeCanvasWithInk(400, 100, 20, 79) });
    const info = extractTextForTest(layer.text!, 300, layer);
    expect(info?.fontSize).toBeCloseTo(80, 0);
  });

  it('a raster far from the engine value within the sanity band is trusted', async () => {
    const { extractTextForTest } = await import('@/services/psdService');
    // Engine says 50 px; raster says ~107 px (ratio 2.14 < 6) → calibrated.
    const layer = textLayer({ canvas: fakeCanvasWithInk(400, 120, 10, 89) });
    const info = extractTextForTest(layer.text!, 300, layer);
    expect(info?.fontSize).toBeCloseTo((80 * 100) / 75, 0);
  });

  it('an empty (fully transparent) raster falls back to the engine size', async () => {
    const { extractTextForTest } = await import('@/services/psdService');
    const layer = textLayer({ canvas: fakeCanvasWithInk(400, 100, 40, 39) }); // no ink
    const info = extractTextForTest(layer.text!, 300, layer);
    expect(info?.fontSize).toBeCloseTo(50, 0);
  });
});
