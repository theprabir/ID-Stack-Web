/**
 * Text-style oracle: renders reference text and compares ink statistics
 * against a target raster to derive the true style (size, bold, italic).
 *
 * PARSE TIME: the target is the PSD layer's original raster; the derived
 * style becomes the layer's oracle (stored on PsdLayerInfo.text).
 * RENDER TIME: drawTextLayer consults the oracle so the substituted text
 * cannot drift from the original style, and a verify-correct loop nudges
 * the rendered ink until it matches the oracle exactly.
 *
 * Rendering the SAME string and comparing ink makes the measurement
 * self-normalising: font fallbacks, hinting and platform differences
 * cancel out because both sides are measured the same way.
 */
import type { InkStats } from './inkScan';
import { measureCanvasInk } from './inkScan';

/** The four font-style variants matched against a raster */
export const STYLE_VARIANTS: ReadonlyArray<{ bold: boolean; italic: boolean }> = [
  { bold: false, italic: false },
  { bold: true, italic: false },
  { bold: false, italic: true },
  { bold: true, italic: true },
];

/** CSS font string for one variant at the given px size */
export function fontCssFor(bold: boolean, italic: boolean, sizePx: number, family: string): string {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${sizePx}px ${family}`;
}

/** Reference canvas height for 100 px measurements */
const REFERENCE_CANVAS_HEIGHT = 300;
/** Baseline y for 100 px reference rendering */
const REFERENCE_BASELINE = 200;

/**
 * Render the given text at 100 px in a font variant and measure its ink.
 * Returns null when the environment cannot rasterise text (jsdom tests).
 */
export function measureReferenceInk(
  bold: boolean,
  italic: boolean,
  family: string,
  content: string
): InkStats | null {
  const canvas = document.createElement('canvas');
  const width = Math.min(4000, Math.max(600, content.length * 90 + 120));
  canvas.width = width;
  canvas.height = REFERENCE_CANVAS_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.font = fontCssFor(bold, italic, 100, family);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000';
  context.fillText(content, 20, REFERENCE_BASELINE);
  const stats = measureCanvasInk(canvas);
  if (!stats || stats.inkHeight < 10 || stats.inkWidth < 10) return null;
  return {
    inkHeight: stats.inkHeight,
    inkWidth: stats.inkWidth,
    inkDensity: stats.inkDensity,
    slant: stats.slant,
  };
}

/** Result of matching a raster against the four style variants */
export interface StyleMatch {
  bold: boolean;
  italic: boolean;
  /** Calibrated font size in the raster's pixel scale */
  fontSize: number;
  /**
   * TRUE when the matched variant is italic but the raster shows NO real
   * slant — the classic upright-font substitution artefact (an upright
   * font synthesised as italic still leans its whole box; a genuinely
   * italic design raster does not read as upright). Callers must treat the
   * style as UPRIGHT (and re-derive bold from engine data) when set.
   */
  vetoItalic?: boolean;
}

/**
 * Pick the style variant whose ink density (weight) and slant (italic)
 * best match the target raster, and derive the font size from the ink
 * height ratio. Pure function — exported for direct unit testing.
 *
 * @param raster - Target ink statistics (the PSD's original pixels)
 * @param candidates - One reference measurement per variant (null = failed)
 * @param engineFontSizePx - Engine-data size for the sanity band
 * @param bandMin - Minimum trusted calibrated/engine ratio (default 0.2)
 * @param bandMax - Maximum trusted calibrated/engine ratio (default 6)
 * @param engineItalic - The engine data's own slant claim (PostScript name
 *        or fauxItalic). When the engine says UPRIGHT and the raster shows
 *        no slant, an italic match is the font-substitution artefact and is
 *        vetoed to upright (the "regular shows italic" bug).
 * @returns Best match, or null when no candidate is usable or the
 *          calibrated size falls outside the sanity band
 */
export function matchTextStyleFromInk(
  raster: InkStats,
  candidates: Array<(InkStats & { bold: boolean; italic: boolean }) | null>,
  engineFontSizePx: number | undefined,
  bandMin = 0.2,
  bandMax = 6,
  engineItalic = false
): StyleMatch | null {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestSize = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate || candidate.inkHeight <= 10) continue;
    // Weight mismatch (relative) + 3× slant mismatch — slant is the
    // stronger, cleaner italic discriminator.
    const score =
      Math.abs(candidate.inkDensity - raster.inkDensity) / Math.max(raster.inkDensity, 0.05) +
      3 * Math.abs(candidate.slant - raster.slant);
    if (score < bestScore) {
      bestScore = score;
      best = index;
      bestSize = (raster.inkHeight * 100) / candidate.inkHeight;
    }
  }
  if (best === -1) return null;
  // Sanity band: engine-data unit quirks scale sizes by fixed factors
  // (1×, 4.17×, 0.24×, …) but never 50× — outside the band the calibration
  // itself is untrustworthy.
  if (engineFontSizePx !== undefined && engineFontSizePx > 0) {
    const ratio = bestSize / engineFontSizePx;
    if (ratio < bandMin || ratio > bandMax) return null;
  }
  const variant = STYLE_VARIANTS[best]!;
  const bestCandidate = candidates[best];
  if (!bestCandidate) return null;
  // ITALIC VETO (the "regular name shows italic" bug): the match is a
  // DENSITY/SIZE comparison. When the environment CANNOT produce a true
  // italic (the design's italic font is missing; canvas falls back to an
  // upright face), the italic REFERENCE renders unslanted too — the 3×
  // slant term then zeroes out for BOTH variants and density alone picks
  // italic for a genuinely UPRIGHT raster. Signals, all required:
  // the matched variant is italic · the ENGINE claims upright (PostScript
  // name without Italic/Oblique, no fauxItalic) · the RASTER shows no
  // slant (≤ 0.02 — the design's own pixels are upright) · the italic
  // REFERENCE rendered unslanted (≤ 0.06 — proof this environment has no
  // real italic, i.e. the match is a substitution artefact). A live
  // italic reference (slant ≥ 0.12) keeps the match trustworthy.
  const vetoItalic =
    variant.italic && !engineItalic && raster.slant <= 0.02 && bestCandidate.slant <= 0.06;
  return {
    bold: variant.bold,
    italic: vetoItalic ? false : variant.italic,
    fontSize: bestSize,
    // Present (true) only when vetoed — absence means a trusted match.
    ...(vetoItalic ? { vetoItalic: true as const } : {}),
  };
}

/**
 * Full parse-time calibration for one text layer: match the four style
 * variants against the layer's raster and return the derived style.
 * Returns null when the raster or the environment is unusable (caller
 * falls back to engine-data values).
 *
 * @param rasterCanvas - The layer's original rasterized pixels
 * @param content - The layer's text content (reference string)
 * @param fontFamily - Resolved CSS font family
 * @param engineFontSizePx - Engine-data-derived size (sanity band)
 */
export function calibrateStyleFromRaster(
  rasterCanvas: HTMLCanvasElement,
  content: string,
  fontFamily: string,
  engineFontSizePx: number | undefined,
  engineItalic = false
): StyleMatch | null {
  // Multi-line text: the ink box spans several lines — no calibration.
  if (/\r|\n/.test(content)) return null;
  const raster = measureCanvasInk(rasterCanvas);
  if (!raster || raster.inkHeight < 4) return null;
  const candidates = STYLE_VARIANTS.map((variant) =>
    measureReferenceInk(variant.bold, variant.italic, fontFamily, content)
  ).map((stats, index) =>
    stats
      ? { ...stats, bold: STYLE_VARIANTS[index]!.bold, italic: STYLE_VARIANTS[index]!.italic }
      : null
  );
  return matchTextStyleFromInk(raster, candidates, engineFontSizePx, 0.2, 6, engineItalic);
}

/** Anchor offsets of a sample string measured with real font metrics.
 * Returned when the environment can rasterise text; null otherwise. */
export interface SampleAnchor {
  /** Ink-box top → baseline distance (px at the reference size) */
  baselineOffset100: number;
  /** Path origin → ink-box left distance (px at the reference size) */
  originOffsetX100: number;
}

/**
 * Measure how a string anchors when drawn at 100 px: the distance from its
 * ink-box top to the drawing baseline, and from the drawing origin to its
 * ink-box left edge. Both divide linearly by the font size, so at parse
 * time they convert a PSD raster's ink box into the true text baseline and
 * origin for ANY substituted string of the same layer.
 *
 * Rendered with the EXACT reference canvas setup used by
 * `measureReferenceInk` so the numbers are directly comparable.
 */
export function measureSampleAnchor(
  bold: boolean,
  italic: boolean,
  family: string,
  content: string
): SampleAnchor | null {
  if (content.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(4000, Math.max(600, content.length * 90 + 120));
  canvas.height = REFERENCE_CANVAS_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.font = fontCssFor(bold, italic, 100, family);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000';
  context.fillText(content, 20, REFERENCE_BASELINE);
  const stats = measureCanvasInk(canvas);
  if (!stats) return null;
  return {
    baselineOffset100: REFERENCE_BASELINE - stats.inkTop,
    originOffsetX100: stats.inkLeft - 20,
  };
}
