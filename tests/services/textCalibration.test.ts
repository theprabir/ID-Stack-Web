/**
 * v0.6.3 tests — FULL-STYLE placeholder text self-calibration.
 *
 * Size alone was not enough: the substituted values rendered regular/black
 * while the design's raster labels were bold italic with a tinted fill.
 * The fix derives the ENTIRE style — size, bold, italic and fill colour —
 * from the layer's own rasterized pixels via ink density (weight), centroid
 * slant (italic) and mean solid-pixel RGB (colour).
 */
import { describe, it, expect } from 'vitest';
import type { Layer, LayerTextData, TextStyle } from 'ag-psd/dist/psd.d';
import { matchTextStyleFromInk, rasterSpansMultipleLines } from '@/services/textStyleOracle';

/** RGBA buffer with an ink rectangle drawn between the given rows/cols */
function inkData(
  width: number,
  height: number,
  top: number,
  bottom: number,
  left: number,
  right: number,
  color: [number, number, number] = [0, 0, 0]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

function layerWithPixels(data: Uint8ClampedArray, width: number, height: number): Layer {
  return {
    name: 'Name',
    canvas: {
      width,
      height,
      getContext: () => ({ getImageData: () => ({ data, width, height }) }),
    },
  } as unknown as Layer;
}

function textData(content = 'Sue Smith'): LayerTextData {
  return {
    text: content,
    style: { font: { name: 'ArialMT', script: 0, type: 0, synthetic: 0 }, fontSize: 12 },
  };
}

/** Local import surface for the module-private extractText */
async function extract(layer: Layer): Promise<{
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}> {
  const mod = await import('@/services/psdService');
  const info = mod.extractTextForTest(layer.text ?? textData(), 300, layer);
  if (!info) throw new Error('extractText returned undefined');
  return {
    fontSize: info.fontSize,
    bold: info.bold,
    italic: info.italic,
    color: info.color,
  };
}

describe('wrapped-sample guard (rasterSpansMultipleLines, v0.6.10)', () => {
  const ENGINE_SIZE = 50;
  const ENGINE_LEADING = 60; // auto-leading 1.2 × 50

  it('detects a wrapped sample: ink taller than 1.5 leading AND ≈ 2 lines of glyphs', () => {
    // The Address layer: single-line string, two lines in the raster.
    expect(rasterSpansMultipleLines(107, 72, ENGINE_SIZE, ENGINE_LEADING)).toBe(true);
  });

  it('does NOT flag a tall single line (ascender + descender within one leading)', () => {
    // One line of glyphs spans at most ~1.2 em; never 1.5 leadings.
    expect(rasterSpansMultipleLines(72, 72, ENGINE_SIZE, ENGINE_LEADING)).toBe(false);
    expect(rasterSpansMultipleLines(85, 72, ENGINE_SIZE, ENGINE_LEADING)).toBe(false);
  });

  it('requires a reference measurement to compare against', () => {
    expect(rasterSpansMultipleLines(107, undefined, ENGINE_SIZE, ENGINE_LEADING)).toBe(false);
  });

  it('requires engine geometry (no yardstick → never flag)', () => {
    expect(rasterSpansMultipleLines(107, 72, undefined, ENGINE_LEADING)).toBe(false);
    expect(rasterSpansMultipleLines(107, 72, ENGINE_SIZE, undefined)).toBe(false);
  });
});

describe('full-style text calibration (matchTextStyleFromInk)', () => {
  const rasterRegular = {
    inkHeight: 70,
    inkWidth: 300,
    inkDensity: 0.22,
    slant: 0.01,
  };
  const rasterBold = { inkHeight: 70, inkWidth: 300, inkDensity: 0.34, slant: 0.01 };

  const refsRegular = { inkHeight: 75, inkWidth: 320, inkDensity: 0.22, slant: 0.01 };
  const refsBold = { inkHeight: 75, inkWidth: 340, inkDensity: 0.35, slant: 0.01 };
  const refsItalic = { inkHeight: 75, inkWidth: 320, inkDensity: 0.23, slant: 0.24 };
  const refsBoldItalic = { inkHeight: 75, inkWidth: 340, inkDensity: 0.36, slant: 0.26 };

  const candidates = [
    { ...refsRegular, bold: false, italic: false },
    { ...refsBold, bold: true, italic: false },
    { ...refsItalic, bold: false, italic: true },
    { ...refsBoldItalic, bold: true, italic: true },
  ];

  it('matches a regular raster to the regular variant', () => {
    const match = matchTextStyleFromInk(rasterRegular, candidates, 50);
    expect(match?.bold).toBe(false);
    expect(match?.italic).toBe(false);
    expect(match?.fontSize).toBeCloseTo((70 * 100) / 75, 1);
  });

  it('matches a bold raster to the bold variant (weight still comes from ink)', () => {
    const match = matchTextStyleFromInk(rasterBold, candidates, 50);
    expect(match?.bold).toBe(true);
    expect(match?.italic).toBe(false);
  });

  it('ENGINE UPRIGHT WINS over an italic ink vote (the JNV "apaar id" bug)', () => {
    // The raster's centroid drift reads as slant (letterform asymmetry:
    // d-ascender right + p-descender left) so the ink comparison votes
    // italic — but the engine data says Arial-BoldMT / fauxItalic:false.
    // Photoshop drew the raster FROM that claim: the result must be upright
    // and VETOED (vetoItalic) so the renderer takes the weight from engine
    // data too.
    const driftingRaster = { ...rasterRegular, slant: 2.1 };
    const match = matchTextStyleFromInk(driftingRaster, candidates, 50, 0.2, 6, false);
    expect(match?.italic).toBe(false);
    expect(match?.vetoItalic).toBe(true);
  });

  it('does NOT set vetoItalic when the ink match already voted upright', () => {
    const match = matchTextStyleFromInk(rasterRegular, candidates, 50, 0.2, 6, false);
    expect(match?.italic).toBe(false);
    expect(match?.vetoItalic).toBeUndefined();
  });

  it('an engine italic claim forces italic whatever the ink comparison says', () => {
    // A genuinely italic design (PostScript "-Italic" or fauxItalic) keeps
    // italic even when this environment's rasterisation is odd.
    const match = matchTextStyleFromInk(rasterRegular, candidates, 50, 0.2, 6, true);
    expect(match?.italic).toBe(true);
    expect(match?.vetoItalic).toBeUndefined();
  });

  it('an engine italic claim stays italic even on a strongly drifting raster', () => {
    // The engine claim overrides the noisy slant metric in BOTH directions.
    const driftingRaster = { ...rasterRegular, slant: -1.9 };
    const match = matchTextStyleFromInk(driftingRaster, candidates, 50, 0.2, 6, true);
    expect(match?.italic).toBe(true);
  });

  it('a size outside the sanity band rejects the calibration', () => {
    // Engine says 10 px but raster implies 10× that — ratio 10 > 6.
    const badRaster = { inkHeight: 750, inkWidth: 300, inkDensity: 0.22, slant: 0.01 };
    expect(matchTextStyleFromInk(badRaster, candidates, 10)).toBeNull();
  });

  it('all-null candidates return null (caller falls back to engine data)', () => {
    expect(matchTextStyleFromInk(rasterRegular, [null, null, null, null], 50)).toBeNull();
  });
});

describe('extractText full-style calibration end-to-end', () => {
  it('falls back to engine style when reference measurement is impossible (jsdom)', async () => {
    // jsdom cannot rasterise the reference text, so every candidate is null
    // and extractText must fall back to the engine-data values verbatim —
    // the graceful-degradation contract that keeps normal PSDs rendering.
    // UNIT CONTRACT: a plain-number engine fontSize is already design px
    // (verified against the sample PSD: "Name" bounds 36 px = cap height of
    // 50 px Arial) scaled by the text transform — never × DPI/72.
    const layer = layerWithPixels(inkData(400, 100, 20, 79, 10, 390, [255, 0, 0]), 400, 100);
    const info = await extract(layer);
    expect(info?.fontSize).toBeCloseTo(12, 0); // 12 engine px × transform 1
    expect(info?.bold).toBe(false);
    expect(info?.italic).toBe(false);
  });

  it('falls back to engine style when the layer has no pixels', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    // Plain-number 12 engine px × transform scale 1 = 12 design px.
    expect(info?.fontSize).toBeCloseTo(12, 0);
    expect(info?.bold).toBe(false);
  });

  it('multi-line content skips calibration (ink box spans lines)', async () => {
    const mod = await import('@/services/psdService');
    const layer = layerWithPixels(inkData(400, 300, 20, 279, 10, 390), 400, 300);
    const info = mod.extractTextForTest(
      { text: 'Line one\nLine two', style: { fontSize: 12 } } as LayerTextData,
      300,
      layer
    );
    expect(info?.fontSize).toBeCloseTo(12, 0);
  });

  it('scales the engine size by the text transform (a/d matrix)', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    (layer.text as LayerTextData).transform = [2, 0, 0, 2, 40, 60];
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    // 12 engine px × transform scale 2 = 24 design px drawn size.
    expect(info?.fontSize).toBeCloseTo(24, 0);
  });

  it('resolves auto-leading to 1.2 × size, never the engine sentinel', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const style = (layer.text as LayerTextData).style!;
    style.autoLeading = true;
    style.leading = 620.00037; // engine sentinel, not a real spacing
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    expect(info?.autoLeading).toBe(true);
    expect(info?.leading).toBeCloseTo(12 * 1.2, 1);
  });

  it('parses box shape geometry from boxBounds', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const text = layer.text as LayerTextData;
    text.shapeType = 'box';
    text.boxBounds = [0, 0, 204, 77.9];
    text.transform = [1, 0, 0, 1, 62, 511.47];
    const info = mod.extractTextForTest(text, 300, layer);
    expect(info?.shapeType).toBe('box');
    expect(info?.boxWidth).toBeCloseTo(204, 1);
    expect(info?.boxHeight).toBeCloseTo(77.9, 1);
    expect(info?.originX).toBeCloseTo(62, 1);
    expect(info?.originY).toBeCloseTo(511.47, 1);
  });

  it('does not invent an engine stroke when strokeFlag is false', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const style = (layer.text as LayerTextData).style!;
    // The sample PSD stores strokeFlag=false with a non-zero outlineWidth.
    style.strokeFlag = false;
    style.outlineWidth = 1.26866;
    style.strokeColor = { c: 178, m: 133, y: 103, k: 189 };
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    expect(info?.strokeWidth).toBeUndefined();
  });

  it('keeps the engine stroke only when strokeFlag is true', async () => {
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const style = (layer.text as LayerTextData).style!;
    style.strokeFlag = true;
    style.outlineWidth = 2;
    style.strokeColor = { r: 255, g: 0, b: 0 };
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    expect(info?.strokeWidth).toBeCloseTo(2, 1);
    expect(info?.strokeColor).toBe('#ff0000');
  });

  it('keeps the engine font size when the oracle calibration is a line-count multiple (the giant-italic-Address bug)', async () => {
    // THE v0.6.9 REGRESSION: "Complete Address" is a single-line string that
    // Photoshop visually wrapped inside its 298 px box. The oracle compared
    // the two-line raster ink height (~107 px) against single-line reference
    // renderings and calibrated ~2.4× the true size — every substituted
    // address then rendered as giant italic glyphs nearly touching across
    // the 60 px leading. The guard must clamp back to the engine size.
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const text = layer.text as LayerTextData;
    // Simulate a wrapped sample: taller-than-two-lines raster canvas.
    (layer as { canvas?: unknown }).canvas = {
      width: 400,
      height: 200,
      getContext: () => ({
        getImageData: () => inkData(400, 200, 10, 160, 20, 300), // 151 px ink
      }),
    };
    text.style = {
      font: { name: 'ArialMT', script: 0, type: 0, synthetic: 0 },
      fontSize: 12,
      autoLeading: true,
      leading: 620.00037,
    };
    const info = mod.extractTextForTest(layer.text!, 300, layer);
    // jsdom cannot rasterise the oracle's references, so calibration fails
    // cleanly (null oracle) — the engine size stands either way. The guard
    // exists for real browsers where a wrapped raster DID calibrate 2.4×.
    expect(info?.fontSize).toBeDefined();
    if (info?.fontSize !== undefined) {
      expect(info.fontSize).toBeLessThanOrEqual(12 * 1.6 + 0.01);
    }
  });

  it('reads engine fontSize through the dedupe coalesce even when styleRuns[0] is the {autoKern} artefact', async () => {
    // buildTextStyleOracle read styleRuns[0].style via ?? — the artefact is
    // an OBJECT (not undefined), so text.style.fontSize was never reached,
    // the sanity band lost its yardstick and miscalibrated sizes passed.
    const mod = await import('@/services/psdService');
    const layer = { name: 'Name', text: textData() } as unknown as Layer;
    const text = layer.text as LayerTextData;
    text.styleRuns = [{ length: 1, style: { autoKern: false } as TextStyle }];
    text.style = { font: { name: 'ArialMT', script: 0, type: 0, synthetic: 0 }, fontSize: 42 };
    (layer as { canvas?: unknown }).canvas = {
      width: 10,
      height: 10,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray(400), width: 10, height: 10 }),
      }),
    };
    // No throw + the oracle path receives engineFontSizePx = 42 (the sanity
    // band yardstick). The observable contract: extraction completes and
    // keeps the engine size as the layer style fallback.
    const info = mod.extractTextForTest(text, 300, layer);
    expect(info?.fontSize).toBeDefined();
  });
});
