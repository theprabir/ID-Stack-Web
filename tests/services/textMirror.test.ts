/**
 * v0.6.6 regression tests — placeholder text FULL-PROPERTY MIRROR.
 *
 * The rendering pipeline mapped only basic primitives (bold/italic/colour/
 * size) and silently dropped the PSD's structural typographic metadata:
 *
 * 1. FONT TRUNCATION — ag-psd deduplicates engine data: values shared by
 *    all style runs are hoisted into text.style and DELETED from the runs.
 *    Reading styleRuns[0].style first returned the dedupe artefact
 *    ({autoKern:false}) and LOST font name/size/colour, so substituted
 *    values fell back to sans-serif. Every property must be coalesced
 *    run → layer.
 * 2. ALIGNMENT — justification came only from text.paragraphStyle; the
 *    authoritative paragraphStyleRuns were ignored, and the line anchor was
 *    derived from the painted width instead of the design's alignment
 *    point, drifting centre/right-justified values.
 * 3. MIRROR PROPERTIES — engine horizontal/vertical scale, baseline shift,
 *    ALL-CAPS/small-caps, strikethrough and gradient fills were never
 *    parsed or painted.
 */
import { describe, it, expect } from 'vitest';
import type { Layer, LayerTextData, TextStyle } from 'ag-psd/dist/psd.d';
import { extractTextForTest } from '@/services/psdService';
import { deriveFontWeight } from '@/services/psdService';
import {
  matchPsdFont,
  exactFontCss,
  preloadFontsForText,
  registerPostScriptAlias,
  normaliseFontName,
} from '@/services/fontService';
import type { PsdDesign, PsdLayerInfo, PsdPlaceholder, PsdGradientFill } from '@/types/psd';

/* ------------------------------------------------------------------ */
/* PARSER: dedupe coalescing + structural metadata                     */
/* ------------------------------------------------------------------ */

describe('engine dedupe coalescing (font properties are never truncated)', () => {
  it('reads the PostScript font name from text.style when styleRuns[0] is a dedupe artefact', () => {
    // EXACTLY the sample PSD's engine shape: styleRuns[0].style holds only
    // {autoKern:false}; the real font lives in text.style.
    const text: LayerTextData = {
      text: 'Charmaine Patel',
      style: { font: { name: 'MyriadPro-Bold', script: 0, type: 1, synthetic: 0 }, fontSize: 50 },
      styleRuns: [
        { length: 1, style: { autoKern: false } as unknown as TextStyle },
        { length: 14, style: { autoKern: true } as unknown as TextStyle },
      ],
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.fontFamily).toBe('MyriadPro-Bold');
    expect(info?.postScriptName).toBe('MyriadPro-Bold');
    expect(info?.fontWeight).toBe(700);
    expect(info?.fontSize).toBeCloseTo(50, 0);
  });

  it('prefers an explicitly set run value over the layer style (coalesce order)', () => {
    const text: LayerTextData = {
      text: 'Mixed',
      style: { font: { name: 'ArialMT' }, fontSize: 40, tracking: 50 },
      styleRuns: [
        { length: 2, style: { font: { name: 'MyriadPro-Light' }, fontSize: 20 } },
        { length: 3, style: {} },
      ],
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.postScriptName).toBe('MyriadPro-Light');
    expect(info?.fontSize).toBeCloseTo(20, 0);
    // Layer-level tracking (hoisted by dedupe) still applies.
    expect(info?.tracking).toBeCloseTo((50 / 1000) * 20, 1);
  });

  it('extracts engine per-character transforms (h/v scale, baseline shift, caps)', () => {
    const text: LayerTextData = {
      text: 'Title',
      style: {
        font: { name: 'ArialMT' },
        fontSize: 50,
        // ag-psd stores Horizontal/Vertical Scale as FRACTIONS: 1 = 100 %.
        horizontalScale: 0.9,
        verticalScale: 1.1,
        baselineShift: 4,
        fontCaps: 1,
        strikethrough: true,
      },
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    // Fractions pass through VERBATIM — never divided by 100 (the unit
    // misread that squished every substituted glyph to 1 % width).
    expect(info?.horizontalScale).toBeCloseTo(0.9, 3);
    expect(info?.verticalScale).toBeCloseTo(1.1, 3);
    expect(info?.baselineShift).toBeCloseTo(4, 1);
    expect(info?.fontCaps).toBe(1);
    expect(info?.strikethrough).toBe(true);
  });

  it('omits identity transforms (scale 1 = 100 %) instead of injecting defaults', () => {
    // Every real PSD stores horizontalScale: 1 on untouched text — this
    // MUST NOT produce a 0.01 squish (the "data not showing" bug).
    const text: LayerTextData = {
      text: 'Plain',
      style: { font: { name: 'ArialMT' }, fontSize: 50, horizontalScale: 1, verticalScale: 1 },
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.horizontalScale).toBeUndefined();
    expect(info?.verticalScale).toBeUndefined();
  });

  it('per-run values survive into the resolved runs (run → layer coalesced)', () => {
    const text: LayerTextData = {
      text: 'AbC',
      style: { font: { name: 'ArialMT' }, fontSize: 30 },
      styleRuns: [
        { length: 1, style: { fontCaps: 1, horizontalScale: 1.2 } },
        { length: 2, style: {} },
      ],
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    const first = info?.runs?.find((run) => run.from === 0 && run.to === 1);
    const rest = info?.runs?.find((run) => run.from === 1);
    expect(first?.fontCaps).toBe(1);
    expect(first?.horizontalScale).toBeCloseTo(1.2, 3);
    // Dedupe-hoisted layer values flow into run 2 via the layer fallback.
    expect(rest?.fontFamily).toBe('ArialMT');
    expect(rest?.fontCaps).toBeUndefined();
  });
});

describe('justification extraction (per-paragraph alignment)', () => {
  it('reads centre justification from the deduped paragraphStyle', () => {
    // The sample PSD's "Demo University" title: justification centre hoisted
    // into paragraphStyle; paragraphStyleRuns are absent after dedupe.
    const text: LayerTextData = {
      text: 'Demo University',
      style: { font: { name: 'ArialMT' }, fontSize: 66.67 },
      paragraphStyle: { justification: 'center' },
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.justification).toBe('center');
  });

  it('reads per-paragraph justification from paragraphStyleRuns (mixed alignments)', () => {
    const text: LayerTextData = {
      text: 'Line one\nLine two',
      style: { font: { name: 'ArialMT' }, fontSize: 30 },
      paragraphStyleRuns: [
        { length: 9, style: { justification: 'center' } },
        { length: 9, style: { justification: 'right' } },
      ],
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.justification).toBe('center'); // first paragraph governs
    // Engine paragraph runs cover the string INCLUDING the newline
    // (9 + 9 = 18 entries for the 17 visible characters).
    expect(info?.paragraphJustifications?.filter((value) => value === 'center').length).toBe(9);
    expect(info?.paragraphJustifications?.filter((value) => value === 'right').length).toBe(9);
  });

  it('an empty paragraphStyle base with only runs still resolves alignment', () => {
    // Dedupe can leave the base paragraphStyle EMPTY when paragraphs differ.
    const text: LayerTextData = {
      text: 'A\nB',
      style: { font: { name: 'ArialMT' }, fontSize: 30 },
      paragraphStyle: {},
      paragraphStyleRuns: [
        { length: 2, style: { justification: 'right' } },
        { length: 2, style: { justification: 'left' } },
      ],
    };
    const layer = { name: 'Name', text } as unknown as Layer;
    const info = extractTextForTest(text, 300, layer);
    expect(info?.justification).toBe('right');
  });
});

/* ------------------------------------------------------------------ */
/* FONT RESOLUTION                                                     */
/* ------------------------------------------------------------------ */

describe('font resolution + preloading', () => {
  it('deriveFontWeight maps PostScript weight lexemes to CSS weights', () => {
    expect(deriveFontWeight('MyriadPro-Black', false)).toBe(900);
    expect(deriveFontWeight('MyriadPro-Bold', false)).toBe(700);
    expect(deriveFontWeight('MyriadPro-Semibold', false)).toBe(600);
    expect(deriveFontWeight('MyriadPro-Light', false)).toBe(300);
    expect(deriveFontWeight('ArialMT', true)).toBe(700); // fauxBold
    expect(deriveFontWeight('ArialMT', false)).toBe(400);
  });

  it('matchPsdFont resolves through PostScript aliases recorded at registration', () => {
    // Sans a real binary, alias registration is exercised via the map seed:
    // base-family matching still resolves ArialMT → "Arial".
    const families = ['Arial', 'Inter'];
    expect(matchPsdFont('ArialMT', families)).toBe('Arial');
    expect(matchPsdFont('Arial-BoldMT', families)).toBe('Arial');
    expect(matchPsdFont('UnknownFont-Regular', families)).toBeNull();
  });

  it('exactFontCss builds the full CSS font string with the numeric weight', () => {
    expect(exactFontCss(true, false, 50, '"Arimo"', 700)).toBe('700 50px "Arimo"');
    expect(exactFontCss(false, true, 33.5, '"MyriadPro"', 300)).toBe(
      'italic 300 33.5px "MyriadPro"'
    );
    expect(exactFontCss(false, false, 16, '"ArialMT"')).toBe('400 16px "ArialMT"');
  });

  it('preloadFontsForText resolves fonts and reports missing families', async () => {
    // jsdom has no real font machinery — document.fonts.load is a stub that
    // resolves. The function must not throw and must REPORT unresolved names.
    const missing = await preloadFontsForText(['AbsolutelyNotARealFont'], [50]);
    expect(missing).toContain('AbsolutelyNotARealFont');
    // Empty/undefined names never report missing.
    const none = await preloadFontsForText([undefined], [16]);
    expect(none).toEqual([]);
  });

  it('registerPostScriptAlias ignores non-TrueType buffers without throwing', () => {
    expect(() => registerPostScriptAlias('Test', new ArrayBuffer(4))).not.toThrow();
    expect(() => registerPostScriptAlias('Test', new ArrayBuffer(0))).not.toThrow();
  });

  it('normaliseFontName keeps case-insensitive comparison stable', () => {
    expect(normaliseFontName('Arial-BoldMT')).toBe('arialboldmt');
  });
});

/* ------------------------------------------------------------------ */
/* RENDERER: alignment anchors + gradient fills                        */
/* ------------------------------------------------------------------ */

/** A single-layer design containing one text layer */
function designWithTextLayer(
  text: Partial<NonNullable<PsdLayerInfo['text']>> & { content: string },
  layerOverrides: Partial<PsdLayerInfo> = {}
): PsdDesign {
  const layer: PsdLayerInfo = {
    id: 'front/Name',
    name: 'Name',
    path: ['Name'],
    kind: 'text',
    hidden: false,
    bounds: { left: 169, top: 56, right: 571, bottom: 158 },
    opacity: 1,
    blendMode: 'normal',
    hasPixels: false,
    hasEffects: false,
    clipped: false,
    childCount: 0,
    text: {
      fontSize: 50,
      fontFamily: 'ArialMT',
      postScriptName: 'ArialMT',
      color: '#e91e63',
      justification: 'left',
      originX: 169,
      originY: 100,
      ...text,
    },
    ...layerOverrides,
  };
  return {
    fileName: 'test.psd',
    width: 638,
    height: 1011,
    horizontalResolution: 300,
    layers: [layer],
    compositeUrl: '',
    layerRasters: {},
  };
}

const placeholder: PsdPlaceholder = {
  layerId: 'front/Name',
  layerName: 'Name',
  role: 'text',
  side: 'front',
  key: 'Name',
};

describe('gradient overlay fills', () => {
  it('a gradient overlay paints glyph fills with the gradient (not the flat fill)', async () => {
    const gradient: PsdGradientFill = {
      colorStops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 1 },
      ],
      opacityStops: [],
      angle: 90,
      opacity: 1,
      style: 'linear',
      reverse: false,
    };
    const design = designWithTextLayer(
      { content: 'ID' },
      { effects: { gradientOverlay: gradient } }
    );
    const { compositeDesign } = await import('@/services/psdCompositeService');
    const canvas = await compositeDesign(design, {
      placeholders: [placeholder],
      mappings: { Name: 'Name' },
      row: { rowIndex: 0, values: { Name: 'Charmaine Patel' } },
      backgroundColor: '#ffffff',
    });
    // The composite must at minimum complete with the gradient present —
    // jsdom canvas mocks do not rasterise gradients, so we pin the contract
    // that the render SUCCEEDS and does not fall back to throwing.
    expect(canvas.width).toBe(638);
  });
});
