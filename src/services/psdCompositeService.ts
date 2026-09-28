/**
 * Re-renders a parsed PSD design onto a canvas with placeholder layers
 * substituted by row data (text) or photos — everything else is drawn
 * from the original layer rasters, untouched, in z-order with original
 * opacity/blend modes.
 *
 * Placeholder faithfulness (v0.5.4): substituted text and photos keep the
 * placeholder layer's ORIGINAL Photoshop styling —
 * - text: font, size, faux bold/italic, colour, tracking, leading,
 *   justification, underline, PLUS layer effects (drop shadow, inner
 *   shadow, outer glow, inner glow, stroke, colour overlay) and
 *   layer/vector mask clipping
 * - photos: centre-crop into the layer bounds PLUS drop shadow, stroke,
 *   colour overlay and mask clipping
 * - both: Photoshop clipping masks (a placeholder clipped to the layer
 *   below) are honoured via the base layer's alpha.
 *
 * Every placeholder is rendered to an offscreen layer canvas (padded so
 * shadows/strokes are not clipped) and composited once, which keeps effect
 * compositing correct over any backdrop.
 */
import type {
  PsdDesign,
  PsdPlaceholder,
  PsdLayerInfo,
  PsdLayerEffects,
  PsdTextStyleOracle,
  PsdGradientFill,
} from '@/types/psd';
import { sideKeyOf } from '@/types/psd';
import type { DataRow, PhotoRecord } from '@/types/data';
import { loadImageElement } from './psdService';
import { resolveFontFamily, preloadFontsForText, exactFontCss } from './fontService';

/** A value lookup: placeholder key → string for the current row */
export type RowResolver = (key: string) => string;

/** Build a resolver for one row from placeholder → column mappings */
export function createRowResolver(
  mappings: Record<string, string>,
  row: DataRow | null
): RowResolver {
  return (key: string): string => {
    const column = mappings[key];
    if (row && column) {
      const value = row.values[column];
      if (value !== undefined && value.length > 0) return value;
    }
    // Show the original PSD content when unmapped (design preview).
    return '';
  };
}

/** Blend mode translation (Photoshop → canvas); unsupported modes fall back */
const BLEND_MODES: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  dissolve: 'source-over',
};

/** Convert a hex colour + 0-1 opacity to a rgba() string (passthrough otherwise) */
function withAlpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '').trim();
  const expanded = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  if (expanded.length !== 6) return hex;
  const value = parseInt(expanded, 16);
  if (Number.isNaN(value)) return hex;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

/** True when the justification anchors the line at its horizontal centre */
function alignsCenter(justification: string): boolean {
  return (
    justification === 'center' ||
    justification === 'justify-center' ||
    justification === 'justify-all'
  );
}

/** True when the justification anchors the line at its right edge */
function alignsRight(justification: string): boolean {
  return justification === 'right' || justification === 'justify-right';
}

/**
 * Justification for one line. Per-paragraph values (paragraphStyleRuns)
 * are positional over the ORIGINAL sample content; when the line comes
 * from substituted content the layer-level justification governs.
 */
function justificationForLine(
  text: NonNullable<PsdLayerInfo['text']>,
  lineStartIndex: number,
  substituted: boolean
): string {
  if (!substituted && text.paragraphJustifications) {
    const perParagraph = text.paragraphJustifications[lineStartIndex];
    if (perParagraph) return perParagraph;
  }
  return text.justification ?? 'left';
}

/**
 * Paint a Photoshop gradient overlay effect as a canvas gradient across a
 * text line's box. Stops map 1:1 from the parsed effect (positions 0–1,
 * colours CSS) with per-stop opacity from the engine's opacity stops;
 * 'reverse' flips the stop order exactly like the Photoshop checkbox.
 */
function gradientFillStyle(
  context: CanvasRenderingContext2D,
  gradient: PsdGradientFill,
  x: number,
  baselineY: number,
  width: number,
  height: number
): string | CanvasGradient {
  let colorStops = [...gradient.colorStops].sort((a, b) => a.position - b.position);
  const opacityStops = [...gradient.opacityStops].sort((a, b) => a.position - b.position);
  if (gradient.reverse) {
    colorStops = colorStops.reverse().map((stop) => ({ ...stop, position: 1 - stop.position }));
  }
  if (colorStops.length === 0) return '#000000';
  const opacityAt = (position: number): number => {
    if (opacityStops.length === 0) return 1;
    if (position <= opacityStops[0]!.position) return opacityStops[0]!.opacity;
    const last = opacityStops[opacityStops.length - 1]!;
    if (position >= last.position) return last.opacity;
    for (let index = 0; index < opacityStops.length - 1; index += 1) {
      const a = opacityStops[index]!;
      const b = opacityStops[index + 1]!;
      if (position >= a.position && position <= b.position) {
        const t = (position - a.position) / Math.max(1e-6, b.position - a.position);
        return a.opacity + (b.opacity - a.opacity) * t;
      }
    }
    return 1;
  };

  const top = baselineY - height * 0.8;
  const centerX = x + width / 2;
  const centerY = top + height / 2;
  const radians = (gradient.angle * Math.PI) / 180;
  const halfLength =
    (Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height) / 2 || 1;
  const canvasGradient =
    gradient.style === 'radial'
      ? context.createRadialGradient(centerX, centerY, 0, centerX, centerY, halfLength)
      : context.createLinearGradient(
          centerX - Math.cos(radians) * halfLength,
          centerY + Math.sin(radians) * halfLength,
          centerX + Math.cos(radians) * halfLength,
          centerY - Math.sin(radians) * halfLength
        );
  for (const stop of colorStops) {
    canvasGradient.addColorStop(
      Math.max(0, Math.min(1, stop.position)),
      withAlpha(stop.color, gradient.opacity * opacityAt(stop.position))
    );
  }
  return canvasGradient;
}

/**
 * Word-wrap text into lines that fit maxWidth at the given font.
 * Widths include tracking (Photoshop wraps tracking-inclusive lines).
 * `maxWidth = Infinity` disables width wrapping (point text, explicit
 * newlines only). Internal spaces are preserved verbatim so multi-space
 * labels ("ID     :" in the sample PSD) align exactly as authored.
 */
function wrapLinesPreserving(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  trackingPx: number,
  maxLines = Number.POSITIVE_INFINITY
): string[] {
  const paragraphs = text.split(/\r\n|\r|\n/);
  const widthOf = (value: string): number =>
    context.measureText(value).width + trackingPx * Math.max(0, value.length - 1);
  const lines: string[] = [];
  const canWrap = Number.isFinite(maxWidth) && maxWidth > 0;
  const lineCap = Number.isFinite(maxLines) ? Math.max(1, Math.floor(maxLines)) : Infinity;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    if (!canWrap) {
      lines.push(paragraph);
      continue;
    }

    // Split on spaces but KEEP the separators so multi-space runs survive.
    const pieces = paragraph.split(/(?<= )/);
    let current = '';
    for (const piece of pieces) {
      const candidate = current + piece;
      const wouldOverflow = widthOf(candidate.trimEnd()) > maxWidth;
      const canCreateAnotherLine = lines.length < lineCap - 1;
      if (wouldOverflow && current.trim().length > 0 && canCreateAnotherLine) {
        lines.push(current.trimEnd());
        current = piece.trimStart();
      } else {
        // Once the calculated capacity is reached, keep the remaining payload
        // on the final line. The wrap-first fitter grants extra lines while
        // compression would break the readability floor; past that the hybrid
        // fitter compresses that final line (never below the floor).
        current = candidate;
      }
    }
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
}

/** Apply a canvas drop shadow from Photoshop angle/distance semantics */
function setShadow(
  context: CanvasRenderingContext2D,
  color: string,
  opacity: number,
  blurPx: number,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  context.shadowColor = withAlpha(color, opacity);
  context.shadowBlur = Math.max(0, blurPx * scale);
  context.shadowOffsetX = offsetX * scale;
  context.shadowOffsetY = offsetY * scale;
}

/** Reset any shadow state on the context */
function clearShadow(context: CanvasRenderingContext2D): void {
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
}

/** Convert a Photoshop drop shadow (angle/distance) to canvas offsets.
 * Photoshop angle is degrees counter-clockwise from +x with y UP; canvas y
 * is DOWN, so offsetY = −sin. */
function shadowOffsets(angleDeg: number, distancePx: number): { offsetX: number; offsetY: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    offsetX: Math.cos(radians) * distancePx,
    offsetY: -Math.sin(radians) * distancePx,
  };
}

/** Extra pixels around a layer's bounds needed for shadow/glow/stroke */
function effectPadding(effects: PsdLayerEffects | undefined, scale: number): number {
  if (!effects) return 2;
  let pad = 2;
  const extent = (blur: number, offsetX: number, offsetY: number): number =>
    blur + Math.max(Math.abs(offsetX), Math.abs(offsetY));
  for (const shadow of effects.dropShadows ?? []) {
    const { offsetX, offsetY } = shadowOffsets(shadow.angle, shadow.distance);
    pad = Math.max(pad, extent(shadow.blur, offsetX, offsetY));
  }
  for (const shadow of effects.innerShadows ?? []) {
    const { offsetX, offsetY } = shadowOffsets(shadow.angle, shadow.distance);
    pad = Math.max(pad, extent(shadow.blur, offsetX, offsetY));
  }
  if (effects.outerGlow) pad = Math.max(pad, effects.outerGlow.blur);
  if (effects.stroke) pad = Math.max(pad, effects.stroke.width * 2);
  return Math.ceil(pad * scale) + 2;
}

/** Create an offscreen canvas of the given size */
function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/**
 * Detect a FULLY-WHITE ("reveal all") layer mask. Photoshop gives every
 * newly created text layer a reveal-all mask — white everywhere, a no-op.
 * ag-psd decodes mask bitmaps as LUMINANCE in RGB with fully-opaque alpha
 * (setupGrayscale + resetAlpha in its reader), so such a mask must be
 * detected from the RGB channels (a pure alpha-based `destination-in` would
 * be a no-op anyway, but it degrades to a hard rectangle clip once the
 * luminance is folded into alpha).
 */
function isRevealAllMask(mask: HTMLCanvasElement): boolean {
  const context = mask.getContext('2d');
  if (!context) return false;
  try {
    const { data } = context.getImageData(0, 0, mask.width, mask.height);
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] !== 255 || data[index + 1] !== 255 || data[index + 2] !== 255) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a layer/vector mask to rendered placeholder content
 * (mask luminance: white = keep, black = hide — Photoshop semantics).
 *
 * THE "N IN JOHNSON" TRIM: masks are sampled ONLY inside the mask rect;
 * outside it the mask is its `defaultColor` (Photoshop's mask background,
 * 0 = hide / 255 = reveal). ag-psd decodes the bitmap as LUMINANCE with
 * fully-opaque alpha, so a naive `drawImage` + `destination-in` (old path)
 * intersected the content with the mask RECT — amputating any substituted
 * value that extends past the original sample's layer bounds even when
 * the visible mask was pure white (the common reveal-all case).
 *
 * 1. Reveal-all masks (white everywhere) are a no-op — the value keeps
 *    its natural overflow, exactly like Photoshop.
 * 2. Real (non-white) masks apply the RECT + fill first, then the decoded
 *    bitmap per-pixel: LUMINANCE drives the keep factor with a hard
 *    threshold at 128 (soft feather steps are approximated, never a
 *    rectangle clip), alpha stays untouched (decode guarantee).
 */
function applyLayerMask(
  content: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  maskLeft: number,
  maskTop: number,
  maskWidth: number,
  maskHeight: number,
  defaultReveal: boolean
): void {
  if (isRevealAllMask(mask)) return;
  const context = content.getContext('2d');
  if (!context) return;
  // Compose the FULL-CANVAS mask plane: background default outside the
  // mask rect, decoded bitmap inside. Composing first (instead of the old
  // erase-then-destination-in sequence) avoids `destination-in`'s erase-
  // outside-source-rect semantics, which destroyed the outside-rect
  // handling — and ONE composite touches every pixel exactly once.
  const plane = makeCanvas(content.width, content.height);
  const planeContext = plane.getContext('2d');
  if (!planeContext) return;
  planeContext.fillStyle = defaultReveal ? '#ffffff' : '#000000';
  planeContext.fillRect(0, 0, plane.width, plane.height);
  planeContext.drawImage(mask, maskLeft, maskTop, maskWidth, maskHeight);
  try {
    const image = planeContext.getImageData(0, 0, plane.width, plane.height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      // ag-psd decodes masks as LUMINANCE with fully-opaque alpha, so the
      // keep factor comes from the RGB channels: threshold at 50 % (masks
      // in real ID templates are binary; antialiased edges stay crisp).
      const keep =
        (data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0) >= 384 ? 255 : 0;
      data[index + 3] = keep;
    }
    planeContext.putImageData(image, 0, 0);
  } catch {
    return; // undecodable mask — leave the content untouched
  }
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(plane, 0, 0);
  context.restore();
}

/**
 * Draw an inner shadow / inner glow onto a layer canvas that already
 * contains the shape (text glyphs or photo).
 *
 * Recipe (Photoshop-accurate composite): the inner shadow is the shape's
 * outside halo, cast with the INVERTED offset, intersected with the shape.
 * 1. halo canvas: draw the shape with canvas shadow at (−dx, −dy);
 * 2. erase the shape itself → only the halo remains;
 * 3. intersect the halo with the shape (destination-in);
 * 4. composite over the layer canvas.
 */
function drawInnerEffect(
  layerCanvas: HTMLCanvasElement,
  drawShape: (context: CanvasRenderingContext2D) => void,
  color: string,
  opacity: number,
  offsetX: number,
  offsetY: number,
  blurPx: number,
  scale: number
): void {
  const halo = makeCanvas(layerCanvas.width, layerCanvas.height);
  const haloContext = halo.getContext('2d');
  if (!haloContext) return;

  // 1. Shape + outside halo with the inverted offset.
  drawShape(haloContext);
  setShadow(haloContext, color, opacity, blurPx, -offsetX, -offsetY, scale);
  drawShape(haloContext);
  clearShadow(haloContext);

  // 2. Remove the shape → only the halo outside it is left.
  haloContext.globalCompositeOperation = 'destination-out';
  drawShape(haloContext);
  haloContext.globalCompositeOperation = 'source-over';

  // 3. Keep only the part of the halo INSIDE the shape.
  haloContext.globalCompositeOperation = 'destination-in';
  drawShape(haloContext);
  haloContext.globalCompositeOperation = 'source-over';

  // 4. Composite the inner halo over the layer content.
  const layerContext = layerCanvas.getContext('2d');
  layerContext?.drawImage(halo, 0, 0);
}

/** Text layout metrics computed once per text layer */
interface TextLayout {
  lines: string[];
  /** First character index of each line within the substituted content */
  lineStarts: number[];
  /** Line start x per line, ABSOLUTE design×scale coords (justification applied) */
  lineX: number[];
  /** Total painted width per line (all style segments, tracking included) */
  lineWidths: number[];
  fontSize: number;
  tracking: number;
  leading: number;
  firstBaseline: number;
  textOriginX: number;
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  ascent: number;
  /** Resolved CSS font family (single resolution for measure + paint) */
  family: string;
  /**
   * Numeric CSS weight derived from the PSD's PostScript font name +
   * fauxBold — part of the exact font string for BOTH measure and paint.
   */
  fontWeight: number;
  /** Per-line justification exactly as authored (paragraph runs honoured) */
  lineJustifications: string[];
  /**
   * Per-line anchor X in design×scale px — the alignment fixed point the
   * line grows/shrinks around: left edge (left), horizontal centre
   * (centre), right edge (right). Derived from the text origin + box, so
   * substituted values align EXACTLY where the design aligned the sample.
   */
  lineAnchorX: number[];
  /**
   * hybrid auto-fit: the horizontal compression ratio (0 < ratio ≤ 1)
   * applied to the painted glyphs — 1 means the value fits its zone
   * naturally at 100 %. Painting wraps the line in a
   * `translate(anchor) → scale(ratio, 1)` transform so ONLY the x-axis
   * squishes: vertical size, weight, colour, strokes, shadows, leading
   * and the baseline position are untouched (Photoshop's Horizontal
   * Scale).
   */
  horizontalScale: number;
  /** Justification of the FIRST line (anchors the auto-fit squish) */
  justification: string;
  /**
   * AUTHORED Horizontal Scale from the PSD character panel (1 = 100 %).
   * Multiplied with the v0.6.5 auto-fit ratio — a design authored at 90 %
   * must render at 90 %, never snapped to 100 %.
   */
  authoredHorizontalScale: number;
  /** AUTHORED Vertical Scale from the PSD character panel (1 = 100 %) */
  authoredVerticalScale: number;
  /** Engine baseline shift in design×scale px (positive = raised) */
  baselineShift: number;
}

/**
 * Style for one character index. SUBSTITUTION SEMANTICS: the engine's style
 * runs are POSITIONAL over the ORIGINAL sample string. A substituted value
 * is a wholesale replacement of that sample, so it never inherits the
 * sample's positional runs — it takes the layer's single style (oracle
 * first — its raster knows the true size/weight/slant/colour). Runs apply
 * only while the ORIGINAL sample text itself is drawn.
 */
function resolveStyleAt(
  text: NonNullable<PsdLayerInfo['text']>,
  oracle: PsdTextStyleOracle | undefined,
  familyBold: boolean,
  familyItalic: boolean,
  index: number,
  substituted: boolean
): { fontSize: number; color: string; bold: boolean; italic: boolean } {
  // VETOED ITALIC (the "regular shows italic" bug): when the oracle's
  // italic match was vetoed to upright, the matched BOLD is equally a
  // substitution artefact (an upright face standing in for "…-BoldItalic"
  // reads regular) — the engine data's own weight claim wins instead.
  const vetoedItalic = oracle?.vetoItalic === true;
  const fallback: { fontSize: number; color: string; bold: boolean; italic: boolean } = {
    fontSize: oracle?.fontSize ?? text.fontSize ?? 18,
    color: text.color || '#000000',
    bold: vetoedItalic ? (text.bold ?? familyBold) : (oracle?.bold ?? text.bold ?? familyBold),
    italic: oracle?.italic ?? text.italic ?? familyItalic,
  };
  if (substituted) return fallback;
  const run = text.runs?.find((segment) => index >= segment.from && index < segment.to);
  if (!run) return fallback;
  return {
    fontSize: oracle?.fontSize ?? run.fontSize ?? fallback.fontSize,
    color: run.color || fallback.color,
    bold: run.bold ?? fallback.bold,
    italic: run.italic ?? fallback.italic,
  };
}

/**
 * The text AS PAINTED after the engine's capitalisation: ALL CAPS maps every
 * character to uppercase; small caps uppercases too (mixed sizing is
 * handled by the paint transform). Measurement uses the SAME mapping so
 * justification/wrapping agree with what is drawn.
 */
function paintedTextOf(value: string, fontCaps: number | undefined): string {
  return fontCaps === 1 || fontCaps === 2 ? value.toUpperCase() : value;
}

/** Per-character mirror properties resolved from the layer + run at an index */
interface CharMirrorProps {
  /** 0 = normal, 1 = ALL CAPS, 2 = small caps */
  fontCaps: number;
  /** Authored horizontal scale multiplier (1 = 100 %) */
  horizontalScale: number;
  /** Authored vertical scale multiplier (1 = 100 %) */
  verticalScale: number;
  /** Baseline shift in design px (positive = raised) */
  baselineShift: number;
  strikethrough: boolean;
}

/**
 * Resolve the engine's per-character transform properties at a content
 * index — substitution semantics match resolveStyleAt: a substituted value
 * takes the LAYER-level properties wholesale; authored sample text honours
 * per-run overrides.
 */
function resolveMirrorPropsAt(
  text: NonNullable<PsdLayerInfo['text']>,
  index: number,
  substituted: boolean
): CharMirrorProps {
  const layerFallback: CharMirrorProps = {
    fontCaps: text.fontCaps ?? 0,
    horizontalScale: text.horizontalScale ?? 1,
    verticalScale: text.verticalScale ?? 1,
    baselineShift: text.baselineShift ?? 0,
    strikethrough: text.strikethrough === true,
  };
  if (substituted) return layerFallback;
  const run = text.runs?.find((segment) => index >= segment.from && index < segment.to);
  if (!run) return layerFallback;
  return {
    fontCaps: run.fontCaps ?? layerFallback.fontCaps,
    // Run scales are engine FRACTIONS (1 = 100 %) — pass through verbatim.
    horizontalScale: run.horizontalScale ?? layerFallback.horizontalScale,
    verticalScale: run.verticalScale ?? layerFallback.verticalScale,
    baselineShift: run.baselineShift ?? layerFallback.baselineShift,
    strikethrough: run.strikethrough ?? layerFallback.strikethrough,
  };
} /**
 * HYBRID TEXT FITTING: classify a placeholder from its authored geometry,
 * wrap multi-line fields up to their calculated line capacity, then apply a
 * single x-only compression ratio when any rendered line is wider than the
 * placeholder's allowed width.
 *
 * The vertical metric is intentionally used for CLASSIFICATION/CAPACITY only.
 * The fitting transform itself is horizontal-only, so font height and leading
 * are never changed to solve overflow.
 */
function textFitMode(
  text: NonNullable<PsdLayerInfo['text']>,
  layerBounds: PsdLayerInfo['bounds'],
  scale: number
): { multiLine: boolean; capacity: number; lineHeight: number; boxWidth: number; boxHeight: number } {
  const lineHeight = Math.max(1, (text.leading ?? (text.fontSize ?? 18) * 1.2) * scale);

  // Photoshop's explicit box geometry is authoritative when available. Some
  // PSDs encode an intended multi-line placeholder as point text while the
  // layer's design bounds still describe the reserved area. Use those bounds
  // as the fallback rectangle so a tall point-text field can become a
  // multi-line field without changing its authored font or vertical scale.
  const explicitBoxWidth = Math.max(0, (text.boxWidth ?? 0) * scale);
  const explicitBoxHeight = Math.max(0, (text.boxHeight ?? 0) * scale);
  const boundsWidth = Math.max(0, (layerBounds.right - layerBounds.left) * scale);
  const boundsHeight = Math.max(0, (layerBounds.bottom - layerBounds.top) * scale);
  const hasExplicitBox =
    text.shapeType === 'box' && explicitBoxWidth > 1 && explicitBoxHeight > 0;
  const boxWidth = hasExplicitBox ? explicitBoxWidth : boundsWidth;
  const boxHeight = hasExplicitBox ? explicitBoxHeight : boundsHeight;
  const capacity = boxHeight > 0 ? Math.max(1, Math.floor(boxHeight / lineHeight)) : 1;

  return {
    multiLine: capacity > 1 && boxWidth > 1,
    capacity,
    lineHeight,
    boxWidth,
    boxHeight,
  };
}

/**
 * Readability floor (v0.6.9) for MULTI-LINE substituted values: Horizontal
 * Scale never drops below this ratio. If wrapping inside the allowed width
 * would need more compression, the value wraps onto another line (while the
 * card has room) or slightly overflows the box instead of becoming an
 * illegible barcode. SINGLE-LINE fields keep the historical 0.05 floor: the
 * authored geometry says the value must stay on one line, so compression is
 * the only fitting tool there.
 */
const MULTI_LINE_MIN_SCALE = 0.65;

/**
 * v0.6.8 HYBRID AUTO-FIT: calculate one x-only compression ratio from the
 * FINAL wrapped layout. Design-preview/sample text is never modified.
 *
 * @param minimumScale - Lowest allowed ratio (default 0.05; multi-line
 *   callers pass MULTI_LINE_MIN_SCALE so text stays readable).
 */
function computeAutoFitScale(
  lineWidths: number[],
  substituted: boolean,
  maxAllowedWidth: number,
  minimumScale = 0.05
): number {
  if (!substituted) return 1;
  if (!(maxAllowedWidth > 0) || !Number.isFinite(maxAllowedWidth)) return 1;

  let worstRatio = 1;
  for (const width of lineWidths) {
    if (!(width > maxAllowedWidth) || !Number.isFinite(width)) continue;
    // Only Horizontal Scale is allowed to change. Never enlarge a fitting
    // value and never collapse it to zero.
    const ratio = Math.max(minimumScale, Math.min(1, maxAllowedWidth / width));
    if (ratio < worstRatio) worstRatio = ratio;
  }
  return worstRatio;
}

/**
 * Shared offscreen measurement context. Using one dedicated canvas for ALL
 * text measurement guarantees the measurement font state matches the draw
 * font state exactly (a mismatch silently mis-centres and mis-wraps text).
 * Sized 10×10 so even the jsdom canvas mock returns consistent metrics.
 */
let measureContext: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D {
  if (!measureContext) measureContext = makeCanvas(10, 10).getContext('2d');
  if (!measureContext) throw new Error('Canvas 2D context unavailable for text measurement.');
  return measureContext;
}

/**
 * Compute the text layout for a text layer at the given scale.
 *
 * GEOMETRY (the Photoshop-semantics fix for clipped/trimmed placeholders):
 * - The text ORIGIN comes from the engine transform (tx, ty) — where
 *   Photoshop actually starts the first line — never from the sample
 *   string's shrink-wrapped ink bounds.
 * - BOX text wraps at the parsed `boxWidth`; POINT text never width-wraps
 *   (explicit newlines only). The offscreen layer canvas GROWS to fit the
 *   measured content (capped at the card edges), so nothing is ever
 *   clipped at the sample's ink box — the design canvas is the only clip,
 *   exactly like Photoshop.
 * - With an oracle, the first baseline uses the ORIGINAL sample's
 *   ink-top→baseline offset (parse-time measured) — a descender-less
 *   sample like "ID" cannot anchor a substituted value by ink top alone.
 */
function computeTextLayout(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  content: string,
  scale: number,
  substituted: boolean,
  maxAllowedWidth: number
): TextLayout {
  const text = layer.text!;
  const oracle = text.oracle;
  const fontSize = (oracle?.fontSize ?? text.fontSize ?? 18) * scale;
  const trackingPx =
    text.tracking !== undefined ? text.tracking * scale : (text.runs?.[0]?.tracking ?? 0) * scale;
  // FONT RESOLUTION (the "Charmaine Patel" bug): use the EXACT PostScript
  // name embedded in the PSD layer — never a sanitised or guessed name —
  // so the registered FontFace (user upload or bundled alias) is hit.
  const fontCssFamily = resolveFontFamily(text.postScriptName ?? text.fontFamily);
  const fontWeight = text.fontWeight ?? (text.bold ? 700 : 400);

  const bounds = layer.bounds;
  const fitMode = textFitMode(text, layer.bounds, scale);
  // A tall point-text placeholder can still be an intended multi-line area.
  // Once the hybrid classifier promotes it to multi-line, use the same box
  // geometry for wrapping and justification anchors.
  const isBox = fitMode.multiLine || (text.shapeType === 'box' && fitMode.boxWidth > 1);
  // Box text has an authored Photoshop text box that is independent of the
  // sample string's raster bounds. Use that geometry as the placeholder
  // boundary; point text continues to use its layer bounds as the fallback.
  const boxLeft = isBox ? (text.originX ?? bounds.left) * scale : bounds.left * scale;
  const boxTop = isBox ? (text.originY ?? bounds.top) * scale : bounds.top * scale;
  const boxWidth = isBox
    ? Math.max(1, fitMode.boxWidth)
    : Math.max(1, (bounds.right - bounds.left) * scale);
  const boxHeight = isBox
    ? Math.max(1, fitMode.boxHeight)
    : Math.max(1, (bounds.bottom - bounds.top) * scale);

  // Text origin: engine transform position when available, else the layer
  // bounds' top-left (older persisted layers without originX/Y).
  const textOriginX = (text.originX ?? bounds.left) * scale;
  const textOriginY = (text.originY ?? bounds.top) * scale;

  // Per-line justification: layer level first (authoritative), per-paragraph
  // runs override for the ORIGINAL content's lines.
  const lineJustifications: string[] = [];

  const metrics = context.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? fontSize * 0.8;

  // Leading: parsed (auto-leading already resolved to 1.2 × size at parse);
  // legacy layers without it fall back to 1.2 × size.
  const leadingDesign =
    text.leading && text.leading > 0
      ? text.leading
      : (oracle?.fontSize ?? text.fontSize ?? 18) * 1.2;
  const leading = leadingDesign * scale;

  // WRAP-FIRST FITTING (v0.6.12): the AUTHORED box height is the line
  // budget — `floor(boxHeight / leading)` lines, never more — and the box
  // width is the hard horizontal boundary. The value wraps NATURALLY at
  // 100 % Horizontal Scale first; if the wrapped lines overflow the box
  // width, the required x-only compression ratio is derived and the text
  // RE-WRAPS at the compressed effective width (boxWidth ÷ ratio) so
  // earlier lines absorb the words that compression has just made room
  // for ("Near Trinity" pulled up onto line 1). Wrap → measure → re-wrap
  // converges in one step for text of uniform style, and never goes below
  // the MULTI_LINE_MIN_SCALE readability floor — a slightly protruding
  // final line beats an illegible barcode strip. Single-line fields keep
  // the historical path: no wrap, 0.05 floor (see computeAutoFitScale).
  const wrapWidth = fitMode.multiLine ? fitMode.boxWidth : Number.POSITIVE_INFINITY;
  const maxWrapLines = fitMode.multiLine ? fitMode.capacity : Number.POSITIVE_INFINITY;
  let lines = wrapLinesPreserving(context, content, wrapWidth, trackingPx, maxWrapLines);
  if (fitMode.multiLine && substituted && Number.isFinite(maxAllowedWidth) && maxAllowedWidth > 0) {
    // Natural width of the widest wrapped line (substituted values render
    // as ONE segment in the layer/oracle style — one measurement is exact).
    const widestNatural = lines.reduce((max, line) => {
      if (line.length === 0) return max;
      const style = resolveStyleAt(
        text,
        text.oracle,
        text.bold ?? false,
        text.italic ?? false,
        0,
        true
      );
      const mirror = resolveMirrorPropsAt(text, 0, true);
      context.font = exactFontCss(
        style.bold,
        style.italic,
        style.fontSize * scale,
        fontCssFamily,
        fontWeight
      );
      const painted = paintedTextOf(line, mirror.fontCaps);
      const width =
        context.measureText(painted).width * mirror.horizontalScale +
        trackingPx * Math.max(0, painted.length - 1);
      return width > max ? width : max;
    }, 0);
    if (widestNatural > maxAllowedWidth) {
      // The compression this layout would need — floored at readability.
      const neededScale = Math.max(
        MULTI_LINE_MIN_SCALE,
        Math.min(1, maxAllowedWidth / widestNatural)
      );
      if (neededScale < 1) {
        // Re-wrap at the compressed effective width: same box, narrower
        // glyphs — earlier lines now fit more words. One pass suffices for
        // uniform-style text; a second pass only ever narrows the ratio.
        const effectiveWidth = maxAllowedWidth / neededScale;
        const rewrapped = wrapLinesPreserving(
          context,
          content,
          effectiveWidth,
          trackingPx,
          maxWrapLines
        );
        if (rewrapped.length <= maxWrapLines) lines = rewrapped;
      }
    }
  }

  // Line starts (content indices) for per-run styling.
  const lineStarts: number[] = [];
  {
    let searchFrom = 0;
    for (const line of lines) {
      const found = content.indexOf(line, searchFrom);
      lineStarts.push(found >= 0 ? found : searchFrom);
      searchFrom = (found >= 0 ? found : searchFrom) + line.length;
    }
  }

  // Leading: parsed value (hoisted above the wrap-first pass).

  // First baseline: with an oracle, EXACTLY where Photoshop drew the
  // sample's first baseline (origin ink-top + parse-measured offset).
  // Without one, the origin + font ascent (the engine-data best guess).
  let firstBaseline: number;
  if (oracle?.baselineOffset !== undefined) {
    firstBaseline = oracle.inkBox.top * scale + oracle.baselineOffset * scale;
  } else {
    firstBaseline = textOriginY + ascent;
  }

  // Per-line start x (justification) and width — computed ONCE here so the
  // canvas sizing, auto-fit and the painting all share the same geometry.
  const lineX: number[] = [];
  const lineAnchorX: number[] = [];
  const lineWidths: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.length === 0) {
      lineJustifications.push(justificationForLine(text, lineStarts[index] ?? 0, substituted));
      lineAnchorX.push(textOriginX + ((text.boxWidth ?? 0) * scale) / 2);
      lineX.push(textOriginX);
      lineWidths.push(0);
      continue;
    }
    const lineStartIndex = lineStarts[index] ?? 0;
    const segments = buildLineSegments(text, line, lineStartIndex, substituted);
    const width = segments.reduce((total, segment) => {
      context.font = exactFontCss(
        segment.style.bold,
        segment.style.italic,
        segment.style.fontSize * scale,
        fontCssFamily,
        fontWeight
      );
      // Painted width: the capitalised text at the segment's AUTHORED
      // horizontal scale — justification anchors must match what is drawn.
      return (
        total +
        context.measureText(paintedTextOf(segment.text, segment.mirror.fontCaps)).width *
          segment.mirror.horizontalScale +
        trackingPx * Math.max(0, segment.text.length - 1)
      );
    }, 0);
    lineWidths.push(width);
    // JUSTIFICATION (the alignment bug): resolve per line — per-paragraph
    // runs for authored content, layer justification for substituted rows —
    // then position the line by its NATURAL width around the alignment
    // ANCHOR (box centre / box right / origin left). Compression later
    // squishes in place around the same anchor, so a substituted value that
    // auto-fits never shifts: centre stays centred, right stays right.
    const justification = justificationForLine(text, lineStartIndex, substituted);
    lineJustifications.push(justification);
    // The anchor: box text aligns within the parsed text box; point text
    // anchors at the engine origin itself.
    const isBox = text.shapeType === 'box' && (text.boxWidth ?? 0) * scale > 1;
    const anchorX = isBox
      ? alignsRight(justification)
        ? textOriginX + (text.boxWidth ?? 0) * scale
        : alignsCenter(justification)
          ? textOriginX + ((text.boxWidth ?? 0) * scale) / 2
          : textOriginX
      : textOriginX;
    lineAnchorX.push(anchorX);
    if (alignsCenter(justification)) {
      lineX.push(anchorX - width / 2);
    } else if (alignsRight(justification)) {
      lineX.push(anchorX - width);
    } else {
      const originOffset = (oracle?.originOffsetX ?? 0) * scale;
      lineX.push(anchorX + originOffset);
    }
  }

  // HYBRID AUTO-FIT: measure the FINAL wrapped/unwrapped lines, then evaluate
  // whether the replacement needs x-only compression. Multi-line fields use
  // the readability floor (wrap-first has already consumed the vertical
  // budget); single-line fields keep the historical 0.05 floor.
  const horizontalScale = computeAutoFitScale(
    lineWidths,
    substituted,
    maxAllowedWidth,
    fitMode.multiLine ? MULTI_LINE_MIN_SCALE : 0.05
  );

  return {
    lines,
    lineStarts,
    lineX,
    lineAnchorX,
    lineWidths,
    fontSize,
    tracking: trackingPx,
    leading,
    firstBaseline,
    textOriginX,
    boxLeft,
    boxTop,
    boxWidth,
    boxHeight,
    ascent,
    family: fontCssFamily,
    fontWeight,
    lineJustifications,
    horizontalScale,
    justification: lineJustifications[0] ?? 'left',
    authoredHorizontalScale: text.horizontalScale ?? 1,
    authoredVerticalScale: text.verticalScale ?? 1,
    baselineShift: (text.baselineShift ?? 0) * scale,
  };
}

/**
 * Maximum allowed zone width for one text layer (design×scale px) — the
 * Hybrid auto-fit boundary the substituted value must respect.
 *
 * - BOX text: the parsed text-box width (`boxWidth`) — the bounding
 *   container the design author allocated.
 * - POINT text: the distance from the text origin to the card's right edge
 *   minus a 4-design-px margin, so the value stays inside the card.
 *
 * @param text - Parsed text info for the layer
 * @param scale - Pixel scale (1 = design pixels)
 * @param cardWidth - Card width in design×scale px
 * @returns The allowed width, or 0 when it cannot be determined
 */
function autoFitMaxAllowedWidth(layer: PsdLayerInfo, scale: number, cardWidth: number): number {
  const text = layer.text!;
  const fitMode = textFitMode(text, layer.bounds, scale);
  // Any field classified as multi-line uses the placeholder rectangle as its
  // hard horizontal boundary, including point-text layers whose design bounds
  // encode the intended area.
  if (fitMode.multiLine && fitMode.boxWidth > 1) return fitMode.boxWidth;
  if (text.shapeType === 'box' && fitMode.boxWidth > 1) return fitMode.boxWidth;
  // Point text: the value may grow from its justification anchor until the
  // card edge (minus a small margin) — the zone it must stay inside.
  const justification = text.justification ?? 'left';
  const originX = (text.originX ?? layer.bounds.left) * scale;
  const margin = 4 * scale;
  if (justification === 'right') {
    const allowed = originX - margin;
    return allowed > 0 ? allowed : 0;
  }
  if (justification === 'center' || justification.startsWith('justify')) {
    // Centre-anchored: the tighter side governs (mirrored around the anchor).
    const side = Math.min(originX, cardWidth - originX);
    const allowed = 2 * (side - margin);
    return allowed > 0 ? allowed : 0;
  }
  const allowed = cardWidth - margin - originX;
  return allowed > 0 ? allowed : 0;
}

/** One painted style segment of a line (maximal run of equal style) */
interface GlyphSegment {
  text: string;
  style: { fontSize: number; color: string; bold: boolean; italic: boolean };
  /** Engine per-character mirror properties (caps, scales, shift, strike) */
  mirror: CharMirrorProps;
}

/**
 * Split a line into maximal same-style segments. For SUBSTITUTED values the
 * whole line is one segment in the layer/oracle style — the engine's
 * positional runs describe the sample string, not the replacement. For the
 * ORIGINAL sample text the layer's runs split the line faithfully (merging
 * adjacent equal-style neighbours); absent/empty runs give one segment.
 */
function buildLineSegments(
  text: NonNullable<PsdLayerInfo['text']>,
  line: string,
  lineStartIndex: number,
  substituted: boolean
): GlyphSegment[] {
  const styleAt = (index: number): GlyphSegment['style'] =>
    resolveStyleAt(text, text.oracle, text.bold ?? false, text.italic ?? false, index, substituted);
  const mirrorAt = (index: number): CharMirrorProps =>
    resolveMirrorPropsAt(text, index, substituted);
  if (substituted || !text.runs || text.runs.length === 0) {
    return [{ text: line, style: styleAt(lineStartIndex), mirror: mirrorAt(lineStartIndex) }];
  }
  const segments: GlyphSegment[] = [];
  let offset = 0;
  while (offset < line.length) {
    const absolute = lineStartIndex + offset;
    const run = text.runs.find((entry) => absolute >= entry.from && absolute < entry.to);
    const runEndAbsolute = run
      ? Math.min(run.to, lineStartIndex + line.length)
      : lineStartIndex + line.length;
    const slice = line.slice(offset, runEndAbsolute - lineStartIndex);
    if (slice.length > 0)
      segments.push({ text: slice, style: styleAt(absolute), mirror: mirrorAt(absolute) });
    offset += slice.length;
  }
  // Merge adjacent segments with identical style (avoids pointless splits).
  const merged: GlyphSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.style.fontSize === segment.style.fontSize &&
      previous.style.color === segment.style.color &&
      previous.style.bold === segment.style.bold &&
      previous.style.italic === segment.style.italic &&
      previous.mirror.fontCaps === segment.mirror.fontCaps &&
      previous.mirror.horizontalScale === segment.mirror.horizontalScale &&
      previous.mirror.baselineShift === segment.mirror.baselineShift &&
      previous.mirror.strikethrough === segment.mirror.strikethrough
    ) {
      previous.text += segment.text;
    } else {
      merged.push(segment);
    }
  }
  return merged.length > 0
    ? merged
    : [{ text: line, style: styleAt(lineStartIndex), mirror: mirrorAt(lineStartIndex) }];
}

/**
 * Draw one text layer with its extracted PSD style AND layer effects onto
 * its (already created) layer canvas. All coordinates are relative to the
 * layer canvas origin (boxLeft − pad, boxTop − pad on the design).
 *
 * Lines paint as style segments (per-run size/colour/weight/italic),
 * justified around the TEXT ORIGIN — never the sample's ink box. The
 * engine text stroke (character-panel outline) paints under the fill;
 * layer-effect stroke/shadow/glow/overlay paint exactly as before.
 */
function drawTextContent(
  layerContext: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  layout: TextLayout,
  offsetX: number,
  offsetY: number,
  scale: number,
  family: string,
  substituted: boolean
): void {
  const text = layer.text!;
  const effects = layer.effects;
  // Photoshop colour overlay (solidFill effect) replaces the text fill.
  const overlay = effects?.solidFill;
  // Photoshop gradient overlay — replaces the fill with a canvas gradient
  // mapped across each line's box (stops/angle/reverse mirrored exactly).
  const gradientFill = effects?.gradientOverlay;
  const stroke = effects?.stroke;
  const dropShadow = effects?.dropShadows?.[0];
  // Engine TEXT stroke (character panel) — only when the PSD enables it.
  const engineStroke =
    text.strokeColor && text.strokeWidth && text.strokeWidth > 0
      ? { color: text.strokeColor, width: text.strokeWidth }
      : undefined;

  for (let index = 0; index < layout.lines.length; index += 1) {
    const line = layout.lines[index] ?? '';
    if (line.length === 0) continue;
    const lineStartIndex = layout.lineStarts[index] ?? 0;
    const segments = buildLineSegments(text, line, lineStartIndex, substituted);
    // Font string built from the PSD's OWN font identity: numeric weight
    // derived from the embedded PostScript name — never a generic string.
    const fontFor = (segment: GlyphSegment): string =>
      exactFontCss(
        segment.style.bold,
        segment.style.italic,
        segment.style.fontSize * scale,
        family,
        layout.fontWeight
      );
    const segmentPaintText = (segment: GlyphSegment): string =>
      paintedTextOf(segment.text, segment.mirror.fontCaps);
    const segmentWidth = (segment: GlyphSegment): number => {
      layerContext.font = fontFor(segment);
      const painted = segmentPaintText(segment);
      const natural =
        layerContext.measureText(painted).width + layout.tracking * Math.max(0, painted.length - 1);
      // Authored character-panel transforms apply to the advance width.
      return natural * segment.mirror.horizontalScale;
    };
    // Geometry (start x, widths, justification) was decided ONCE in
    // computeTextLayout — the same source that sized the layer canvas.
    const x = layout.lineX[index]! - offsetX;
    const y = layout.firstBaseline + index * layout.leading - offsetY - layout.baselineShift;

    // HYBRID AUTO-FIT paint transform: squish ONLY the x-axis around the
    // line's own justification anchor (left edge / centre / right edge),
    // so the value compresses IN PLACE — it never shifts position. Every
    // pass below (engine stroke, effect stroke, shadow, fill, inner
    // effects, glow, underline) paints through this transform, so all
    // effects compress with the glyphs while vertical size, leading and
    // the baseline stay untouched. Ratio 1 (the value fits) is a no-op.
    const ratio = layout.horizontalScale;
    const naturalWidth = layout.lineWidths[index] ?? 0;
    // Anchor from the LAYOUT's per-line anchor (design-space alignment
    // point), not the painted width — a substituted value that auto-fits
    // keeps the exact alignment the design authored.
    const anchor = (layout.lineAnchorX[index] ?? x) - offsetX;
    const applySquish = (): void => {
      layerContext.save();
      layerContext.translate(anchor, 0);
      layerContext.scale(ratio, 1);
      layerContext.translate(-anchor, 0);
    };

    /** Paint one segment: font → caps text → per-glyph advance (tracking,
     * authored h/v scale). fill OR stroke, with the segment's mirror props. */
    const paintSegment = (
      segment: GlyphSegment,
      cursorX: number,
      mode: 'fill' | 'stroke'
    ): number => {
      layerContext.font = fontFor(segment);
      const painted = segmentPaintText(segment);
      const vScale = segment.mirror.verticalScale;
      const hScale = segment.mirror.horizontalScale;
      const drawGlyph = (glyph: string, glyphX: number): void => {
        if (vScale === 1 && hScale === 1) {
          if (mode === 'fill') layerContext.fillText(glyph, glyphX, y);
          else layerContext.strokeText(glyph, glyphX, y);
          return;
        }
        // Character-panel transforms (Horizontal/Vertical Scale): scale the
        // glyphs themselves around (glyphX, baseline) — x-only squish or
        // y-only stretch, exactly like Photoshop's engine.
        layerContext.save();
        layerContext.translate(glyphX, y);
        layerContext.scale(hScale, vScale);
        if (mode === 'fill') layerContext.fillText(glyph, 0, 0);
        else layerContext.strokeText(glyph, 0, 0);
        layerContext.restore();
      };
      if (layout.tracking === 0) {
        drawGlyph(painted, cursorX);
        return layerContext.measureText(painted).width * segment.mirror.horizontalScale;
      }
      let cursor = cursorX;
      for (const character of painted) {
        drawGlyph(character, cursor);
        cursor +=
          layerContext.measureText(character).width * segment.mirror.horizontalScale +
          layout.tracking;
      }
      return cursor - cursorX - layout.tracking; // last tracking not part of width
    };
    const fillSegment = (segment: GlyphSegment, cursorX: number): void => {
      void paintSegment(segment, cursorX, 'fill');
    };
    const strokeSegment = (segment: GlyphSegment, cursorX: number): void => {
      void paintSegment(segment, cursorX, 'stroke');
    };
    /** Shape-only painter for inner-effect compositing */
    const drawShape = (target: CanvasRenderingContext2D): void => {
      target.textBaseline = layerContext.textBaseline;
      // v0.6.5: inner effects composite on SEPARATE halo canvases that do
      // not inherit the layer context's transform — apply the same anchor
      // squish so inner shadows/glows track the compressed glyphs exactly.
      if (ratio !== 1) {
        target.save();
        target.translate(anchor, 0);
        target.scale(ratio, 1);
        target.translate(-anchor, 0);
      }
      let cursor = x;
      for (const segment of segments) {
        target.font = fontFor(segment);
        const painted = segmentPaintText(segment);
        const vScale = segment.mirror.verticalScale;
        const hScale = segment.mirror.horizontalScale;
        const drawTargetGlyph = (glyph: string, glyphX: number): void => {
          if (vScale === 1 && hScale === 1) {
            target.fillText(glyph, glyphX, y);
            return;
          }
          target.save();
          target.translate(glyphX, y);
          target.scale(hScale, vScale);
          target.fillText(glyph, 0, 0);
          target.restore();
        };
        if (layout.tracking === 0) {
          drawTargetGlyph(painted, cursor);
        } else {
          let inner = cursor;
          for (const character of painted) {
            drawTargetGlyph(character, inner);
            inner +=
              target.measureText(character).width * segment.mirror.horizontalScale +
              layout.tracking;
          }
        }
        cursor += segmentWidth(segment);
      }
      if (ratio !== 1) target.restore();
    };

    // --- Squish window 1: engine stroke → effect stroke → shadow → fill.
    // (Inner effects composite between the windows at identity — drawShape
    // squishes itself on its halo canvases.)
    if (ratio !== 1) applySquish();
    try {
      // --- Engine text stroke: painted UNDER everything, like Photoshop.
      if (engineStroke) {
        layerContext.save();
        layerContext.strokeStyle = engineStroke.color;
        layerContext.lineWidth = engineStroke.width * scale;
        layerContext.lineJoin = 'round';
        let cursor = x;
        for (const segment of segments) {
          strokeSegment(segment, cursor);
          cursor += segmentWidth(segment);
        }
        layerContext.restore();
      }

      // --- Layer-effect stroke: painted UNDER the fill so the glyph face
      // keeps its colour. Outside/inside positions are approximated with a
      // doubled/normal width under-stroke (canvas cannot offset outlines).
      if (stroke) {
        layerContext.save();
        layerContext.globalAlpha *= stroke.opacity;
        layerContext.strokeStyle = stroke.color;
        layerContext.lineWidth = Math.max(1, stroke.width * (stroke.position === 'center' ? 1 : 2));
        layerContext.lineJoin = 'round';
        let cursor = x;
        for (const segment of segments) {
          strokeSegment(segment, cursor);
          cursor += segmentWidth(segment);
        }
        layerContext.restore();
      }

      // --- Drop shadow: cast from the glyph shape, then repaint the fill.
      if (dropShadow) {
        const { offsetX: sx, offsetY: sy } = shadowOffsets(dropShadow.angle, dropShadow.distance);
        layerContext.save();
        setShadow(layerContext, dropShadow.color, dropShadow.opacity, dropShadow.blur, sx, sy, 1);
        let cursor = x;
        for (const segment of segments) {
          fillSegment(segment, cursor);
          cursor += segmentWidth(segment);
        }
        layerContext.restore();
      }

      // --- Main fill pass (per-segment colour; solid/gradient overlays
      // replace every fill — Photoshop semantics).
      layerContext.save();
      let cursor = x;
      for (const segment of segments) {
        const fillStyle = gradientFill
          ? gradientFillStyle(
              layerContext,
              gradientFill,
              x,
              y,
              Math.max(1, naturalWidth),
              layout.fontSize * 1.2
            )
          : overlay
            ? overlay.color
            : segment.style.color;
        layerContext.fillStyle = fillStyle;
        if (overlay) layerContext.globalAlpha = layerContext.globalAlpha * overlay.opacity;
        fillSegment(segment, cursor);
        if (overlay) layerContext.globalAlpha = layerContext.globalAlpha / overlay.opacity;
        cursor += segmentWidth(segment);
      }
      layerContext.restore();
    } finally {
      if (ratio !== 1) layerContext.restore();
    }

    // --- Inner shadow / inner glow, intersected with the glyph shape.
    // Painted OUTSIDE the squish window: drawShape applies the same anchor
    // compression on its halo canvases itself, so the halo is composited at
    // identity (never compressed twice).
    const innerShadow = effects?.innerShadows?.[0];
    const innerGlow = effects?.innerGlow;
    if (innerShadow) {
      const { offsetX: sx, offsetY: sy } = shadowOffsets(innerShadow.angle, innerShadow.distance);
      drawInnerEffect(
        layerContext.canvas,
        drawShape,
        innerShadow.color,
        innerShadow.opacity,
        sx,
        sy,
        innerShadow.blur,
        1
      );
    }
    if (innerGlow) {
      drawInnerEffect(
        layerContext.canvas,
        drawShape,
        innerGlow.color,
        innerGlow.opacity,
        0,
        0,
        innerGlow.blur,
        1
      );
    }

    // --- Squish window 2: outer glow → underline.
    if (ratio !== 1) applySquish();
    try {
      // --- Outer glow: soft centred halo beneath the fill (drawn per line).
      const outerGlow = effects?.outerGlow;
      if (outerGlow) {
        layerContext.save();
        setShadow(layerContext, outerGlow.color, outerGlow.opacity, outerGlow.blur, 0, 0, 1);
        let glowCursor = x;
        for (const segment of segments) {
          layerContext.fillStyle = segment.style.color;
          fillSegment(segment, glowCursor);
          glowCursor += segmentWidth(segment);
        }
        layerContext.restore();
      }

      // --- Underline / strikethrough: thin bars below the baseline /
      // mid-x-height (Photoshop-like), per segment so mixed-size runs get
      // proportionate bars. Gradient/solid overlays colour them too.
      if (text.underline || text.strikethrough) {
        layerContext.save();
        let barCursor = x;
        for (const segment of segments) {
          layerContext.fillStyle = gradientFill
            ? gradientFillStyle(
                layerContext,
                gradientFill,
                x,
                y,
                Math.max(1, naturalWidth),
                layout.fontSize * 1.2
              )
            : overlay
              ? overlay.color
              : segment.style.color;
          const em = segment.style.fontSize * scale;
          if (text.underline) {
            const thickness = Math.max(1, em * 0.05);
            layerContext.fillRect(barCursor, y + em * 0.12, segmentWidth(segment), thickness);
          }
          if (segment.mirror.strikethrough) {
            const thickness = Math.max(1, em * 0.05);
            layerContext.fillRect(barCursor, y - em * 0.28, segmentWidth(segment), thickness);
          }
          barCursor += segmentWidth(segment);
        }
        layerContext.restore();
      }
    } finally {
      if (ratio !== 1) layerContext.restore();
    }
  }
}

/**
 * Render a placeholder text layer (or any text layer) onto the target
 * context through a padded offscreen canvas so effects are never clipped
 * and masks apply to the glyphs exactly like Photoshop.
 *
 * THE STORED ORACLE IS APPLIED VERBATIM (size/weight/slant/colour measured
 * from the original raster; never re-derived per substituted string), and
 * the canvas GROWS to fit the measured content — capped only by the card
 * edges. Nothing is ever clipped at the sample string's ink box; the design
 * canvas is the only clip, exactly like Photoshop.
 */
function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  content: string,
  scale: number,
  cardWidth: number,
  cardHeight: number
): void {
  const text = layer.text;
  if (!text) return;

  // Measure with the EXACT font string(s) used for drawing on the shared
  // measurement canvas so wrapping/justification agree with what is drawn.
  // SUBSTITUTION SEMANTICS: an empty substitution means "design as
  // authored" (the original sample is drawn — its positional style runs
  // apply). Any non-empty value REPLACES the sample wholesale and takes the
  // layer's single style; the sample's runs never split the replacement.
  const substituted = content.length > 0 && content !== text.content;
  let layout: TextLayout;
  try {
    const measure = getMeasureContext();
    // Set the EXACT font of this layer's first style on the measure context
    // BEFORE measuring ascent — metrics belong to the PSD's font, not to
    // whatever font string the previous layer left behind.
    measure.font = exactFontCss(
      text.bold ?? false,
      text.italic ?? false,
      (text.oracle?.fontSize ?? text.fontSize ?? 18) * scale,
      resolveFontFamily(text.postScriptName ?? text.fontFamily),
      text.fontWeight ?? (text.bold ? 700 : 400)
    );
    // v0.6.5: the auto-fit boundary (text box for box text; origin → card
    // edge for point text) is decided ONCE here and shared by layout and
    // painting.
    const maxAllowed = autoFitMaxAllowedWidth(layer, scale, cardWidth);
    layout = computeTextLayout(measure, layer, content, scale, substituted, maxAllowed);
  } catch {
    // Canvas 2D unavailable — nothing sensible can be drawn.
    return;
  }

  const pad = effectPadding(layer.effects, scale);
  // Bounding box of the drawn ink (all lines, origin-anchored + justified),
  // unioned with the layer bounds (mask placement stays aligned with the
  // original layer area).
  let inkLeft = layout.boxLeft;
  let inkTop = layout.boxTop;
  let inkRight = layout.boxLeft + layout.boxWidth;
  let inkBottom = layout.boxTop + layout.boxHeight;
  for (let index = 0; index < layout.lines.length; index += 1) {
    const startX = layout.lineX[index] ?? layout.textOriginX;
    const width = (layout.lineWidths[index] ?? 0) * layout.horizontalScale;
    const baseline = layout.firstBaseline + index * layout.leading;
    if (startX < inkLeft) inkLeft = startX;
    if (startX + width > inkRight) inkRight = startX + width;
    if (baseline - layout.ascent < inkTop) inkTop = baseline - layout.ascent;
    if (baseline + layout.ascent * 0.35 > inkBottom) inkBottom = baseline + layout.ascent * 0.35;
  }

  // Canvas origin + size: the ink box grown by the effect padding, then
  // clamped to the card so the design canvas is the only visible clip.
  const canvasLeft = Math.max(0, Math.floor(inkLeft - pad));
  const canvasTop = Math.max(0, Math.floor(inkTop - pad));
  const canvasRight = Math.min(cardWidth, Math.ceil(inkRight + pad));
  const canvasBottom = Math.min(cardHeight, Math.ceil(inkBottom + pad));
  const canvasWidth = Math.max(1, canvasRight - canvasLeft);
  const canvasHeight = Math.max(1, canvasBottom - canvasTop);
  const layerCanvas = makeCanvas(canvasWidth, canvasHeight);
  const layerContext = layerCanvas.getContext('2d');
  if (!layerContext) return;

  layerContext.textBaseline = 'alphabetic';

  drawTextContent(
    layerContext,
    layer,
    layout,
    canvasLeft,
    canvasTop,
    scale,
    layout.family,
    substituted
  );

  // Layer/vector mask: keep only the masked part of the rendered text.
  // THE "N IN JOHNSON" TRIM (v0.6.7): the old path drew the mask bitmap
  // straight through `destination-in` — but ag-psd decodes masks as
  // LUMINANCE with fully-opaque alpha, so that intersected the text with
  // the mask RECT (the sample's layer bounds). A substituted value wider
  // than the sample ("Alice Johnson" vs "ID") was amputated at that edge —
  // a hard vertical cut mid-glyph with card space still visible to the
  // right. applyLayerMask treats white (reveal-all) masks as a no-op and
  // clips real masks to their rect + luminance instead.
  if (layer.maskCanvas) {
    const bounds = layer.bounds;
    applyLayerMask(
      layerCanvas,
      layer.maskCanvas,
      (layer.maskOffset?.left ?? bounds.left) * scale - canvasLeft,
      (layer.maskOffset?.top ?? bounds.top) * scale - canvasTop,
      Math.max(1, (bounds.right - bounds.left) * scale),
      Math.max(1, (bounds.bottom - bounds.top) * scale),
      (layer.maskDefaultColor ?? 0) > 127
    );
  }

  context.drawImage(layerCanvas, canvasLeft, canvasTop);
}

/**
 * Draw a photo into the placeholder layer's bounds with the placeholder's
 * original Photoshop styling: drop shadow, stroke, colour overlay and
 * layer/vector mask clipping. The photo is centre-cropped to the layer's
 * aspect (never stretched), rendered to a padded offscreen canvas so the
 * shadow is not clipped, then composited onto the card.
 */
async function drawPhotoLayer(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  photo: PhotoRecord | undefined,
  scale: number
): Promise<void> {
  const bounds = layer.bounds;
  const dx = bounds.left * scale;
  const dy = bounds.top * scale;
  const dw = Math.max(1, (bounds.right - bounds.left) * scale);
  const dh = Math.max(1, (bounds.bottom - bounds.top) * scale);

  if (!photo) {
    // Keep the design untouched when no photo matched — the caller draws the
    // original raster so the placeholder area is not blank.
    return;
  }

  const effects = layer.effects;
  const image = await loadImageElement(photo.blobUrl);
  const targetAspect = dw / dh;
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let cropWidth = image.naturalWidth;
  let cropHeight = image.naturalHeight;
  if (sourceAspect > targetAspect) {
    cropWidth = Math.round(image.naturalHeight * targetAspect);
  } else {
    cropHeight = Math.round(image.naturalWidth / targetAspect);
  }
  const cropX = Math.round((image.naturalWidth - cropWidth) / 2);
  const cropY = Math.round((image.naturalHeight - cropHeight) / 2);

  const pad = effectPadding(effects, scale);
  const layerCanvas = makeCanvas(dw + pad * 2, dh + pad * 2);
  const layerContext = layerCanvas.getContext('2d');
  if (!layerContext) return;

  const stroke = effects?.stroke;
  const dropShadow = effects?.dropShadows?.[0];
  const drawPhotoShape = (target: CanvasRenderingContext2D): void => {
    target.drawImage(image, cropX, cropY, cropWidth, cropHeight, pad, pad, dw, dh);
  };

  // Drop shadow cast by the photo rectangle, then the photo covers its own
  // area so only the outer shadow stays visible (Photoshop default).
  if (dropShadow) {
    const { offsetX, offsetY } = shadowOffsets(dropShadow.angle, dropShadow.distance);
    layerContext.save();
    setShadow(
      layerContext,
      dropShadow.color,
      dropShadow.opacity,
      dropShadow.blur,
      offsetX,
      offsetY,
      scale
    );
    layerContext.fillStyle = '#000000';
    layerContext.fillRect(pad, pad, dw, dh);
    layerContext.restore();
  }

  // Photo (centre-cropped, never stretched).
  drawPhotoShape(layerContext);

  // Inner shadows: intersected with the photo area (same recipe as text).
  const innerShadow = effects?.innerShadows?.[0];
  if (innerShadow) {
    const { offsetX, offsetY } = shadowOffsets(innerShadow.angle, innerShadow.distance);
    drawInnerEffect(
      layerCanvas,
      drawPhotoShape,
      innerShadow.color,
      innerShadow.opacity,
      offsetX * scale,
      offsetY * scale,
      innerShadow.blur * scale,
      1
    );
  }

  // Colour overlay (solidFill effect) tinting the photo.
  const solidFill = effects?.solidFill;
  if (solidFill) {
    layerContext.save();
    layerContext.globalCompositeOperation = 'source-atop';
    layerContext.fillStyle = withAlpha(solidFill.color, solidFill.opacity);
    layerContext.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    layerContext.restore();
  }

  // Outer glow: halo around the photo rectangle.
  const outerGlow = effects?.outerGlow;
  if (outerGlow) {
    layerContext.save();
    setShadow(layerContext, outerGlow.color, outerGlow.opacity, outerGlow.blur, 0, 0, scale);
    layerContext.fillStyle = 'rgba(0, 0, 0, 0.001)';
    layerContext.fillRect(pad, pad, dw, dh);
    layerContext.restore();
  }

  // Stroke: outline around the photo. "Inside"/"center" sit within the
  // photo bounds; "outside" extends beyond the trim edge (hence padding).
  if (stroke) {
    layerContext.save();
    layerContext.globalAlpha *= stroke.opacity;
    layerContext.strokeStyle = stroke.color;
    const width = stroke.width * scale;
    layerContext.lineWidth = width;
    const inset =
      stroke.position === 'outside'
        ? pad - width / 2
        : pad + (stroke.position === 'inside' ? width / 2 : 0);
    layerContext.strokeRect(inset, inset, dw + pad * 2 - inset * 2, dh + pad * 2 - inset * 2);
    layerContext.restore();
  }

  // Layer/vector mask: keep only the masked part of the styled photo.
  // v0.6.7: white (reveal-all) masks are a no-op; real masks clip at the
  // mask rect + luminance (see applyLayerMask — the raw drawImage path
  // rect-clipped substituted content at the sample's layer bounds).
  if (layer.maskCanvas) {
    applyLayerMask(
      layerCanvas,
      layer.maskCanvas,
      pad + ((layer.maskOffset?.left ?? bounds.left) - bounds.left) * scale,
      pad + ((layer.maskOffset?.top ?? bounds.top) - bounds.top) * scale,
      dw,
      dh,
      (layer.maskDefaultColor ?? 0) > 127
    );
  }

  context.drawImage(layerCanvas, dx - pad, dy - pad);
}

/** Draw the original raster of a layer (untouched layers) */
async function drawRasterLayer(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  rasterUrl: string | undefined,
  scale: number
): Promise<void> {
  if (!rasterUrl) return;
  const image = await loadImageElement(rasterUrl);
  const bounds = layer.bounds;
  // Layer rasters cover exactly the layer bounds.
  context.drawImage(
    image,
    bounds.left * scale,
    bounds.top * scale,
    Math.max(1, (bounds.right - bounds.left) * scale),
    Math.max(1, (bounds.bottom - bounds.top) * scale)
  );
}

export interface CompositeOptions {
  /** Pixel scale (1 = design pixels) */
  scale?: number;
  /** Placeholder definitions keyed by layer id */
  placeholders: PsdPlaceholder[];
  /** Placeholder key → column mappings */
  mappings: Record<string, string>;
  /** Current data row (null = design as-is) */
  row: DataRow | null;
  /** rowIndex → matched photo */
  getPhoto?: (rowIndex: number) => PhotoRecord | undefined;
  /** Background fill when the PSD has transparent areas */
  backgroundColor?: string;
}

/**
 * Render one layer's pixels (raster or already-drawn content) masked by the
 * alpha of its clipping base (Photoshop clipping mask). The base is the
 * nearest layer below in z-order that is not itself clipped.
 *
 * @param content - Canvas holding the clipped layer's rendered pixels
 * @param baseRasterUrl - Raster of the base layer (its alpha defines the mask)
 * @param base - The base layer descriptor
 * @param scale - Pixel scale
 * @returns Masked canvas, or the original content when masking is impossible
 */
async function applyClippingMask(
  content: HTMLCanvasElement,
  baseRasterUrl: string | undefined,
  base: PsdLayerInfo,
  scale: number
): Promise<HTMLCanvasElement> {
  if (!baseRasterUrl) return content;
  try {
    const baseImage = await loadImageElement(baseRasterUrl);
    const masked = makeCanvas(content.width, content.height);
    const maskedContext = masked.getContext('2d');
    if (!maskedContext) return content;
    // Base layer alpha, at design scale, relative to the content origin.
    maskedContext.drawImage(
      baseImage,
      base.bounds.left * scale,
      base.bounds.top * scale,
      Math.max(1, (base.bounds.right - base.bounds.left) * scale),
      Math.max(1, (base.bounds.bottom - base.bounds.top) * scale)
    );
    maskedContext.globalCompositeOperation = 'source-in';
    maskedContext.drawImage(content, 0, 0);
    return masked;
  } catch {
    // Fail-safe: show the unmasked content rather than dropping the layer.
    return content;
  }
}

/**
 * Composite a design with row data applied onto a new canvas.
 *
 * @param design - Parsed design for one side
 * @param options - Composite options (row, mappings, photos, scale)
 * @returns Rendered canvas
 */
export async function compositeDesign(
  design: PsdDesign,
  options: CompositeOptions
): Promise<HTMLCanvasElement> {
  const scale = options.scale ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(design.width * scale));
  canvas.height = Math.max(1, Math.round(design.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');

  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const placeholderByLayer = new Map(
    options.placeholders.map((placeholder) => [placeholder.layerId, placeholder])
  );
  const resolver = createRowResolver(options.mappings, options.row);

  // FONT PRELOAD (the "Charmaine Patel" fallback-font bug): BEFORE any
  // measurement or painting, load every font the design's text layers
  // reference — resolved from the embedded PostScript names against the
  // registered FontFaces (user uploads + bundled aliases). Awaited so the
  // FIRST layout pass already measures/paints with the exact family; canvas
  // text would otherwise silently use the last-set (fallback) font.
  const textLayers = design.layers.filter((layer) => layer.kind === 'text' && layer.text);
  const referencedFonts = textLayers.flatMap((layer) => {
    const text = layer.text!;
    return [
      text.postScriptName,
      text.fontFamily,
      ...(text.runs ?? []).map((run) => run.fontFamily),
    ];
  });
  const referencedSizes = [...new Set(textLayers.map((layer) => layer.text!.fontSize ?? 18))];
  try {
    await preloadFontsForText(referencedFonts, referencedSizes.length > 0 ? referencedSizes : [16]);
  } catch {
    // Font loading is best-effort: the browser falls back by family name.
  }

  // Paint in stored order: ag-psd returns children bottom-most first (file
  // order), so iterating forwards paints the background first and content
  // above it. Reversing here would paint the opaque background LAST and hide
  // every other layer (v0.4.2 blank-output fix).
  const layers = design.layers;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!;
    if (layer.hidden) continue;
    if (layer.kind === 'group') continue; // groups contribute no pixels

    const placeholder = placeholderByLayer.get(layer.id);
    const isTextPlaceholder = placeholder?.role === 'text' && layer.kind === 'text';
    const isPhotoPlaceholder = placeholder?.role === 'photo';

    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = BLEND_MODES[layer.blendMode] ?? 'source-over';

    if (isTextPlaceholder) {
      const substituted = resolver(placeholder!.key);
      // Unmapped/empty → keep the original sample text (design as authored).
      const content = substituted.length > 0 ? substituted : (layer.text?.content ?? '');
      drawTextLayer(context, layer, content, scale, canvas.width, canvas.height);
    } else if (isPhotoPlaceholder) {
      const photo = options.getPhoto?.(options.row?.rowIndex ?? -1);
      if (photo) {
        // Render the styled photo to an offscreen canvas so a Photoshop
        // clipping mask (base layer below) can be applied to the result.
        const stage = makeCanvas(canvas.width, canvas.height);
        const stageContext = stage.getContext('2d');
        if (stageContext) {
          await drawPhotoLayer(stageContext, layer, photo, scale);
          let rendered: HTMLCanvasElement = stage;
          if (layer.clipped) {
            const base = layers[layerIndex - 1];
            if (base && !base.clipped) {
              rendered = await applyClippingMask(stage, design.layerRasters[base.id], base, scale);
            }
          }
          context.drawImage(rendered, 0, 0);
        }
      } else {
        await drawRasterLayer(context, layer, design.layerRasters[layer.id], scale);
      }
    } else {
      // Untouched layer: draw the original raster exactly as-is.
      await drawRasterLayer(context, layer, design.layerRasters[layer.id], scale);
    }
    context.restore();
  }

  return canvas;
}

/** Convert a canvas to a Blob (PNG or JPEG) */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas.toBlob returned null.'));
      },
      type,
      quality
    );
  });
}

/** Helper used by batch naming */
export { sideKeyOf };
