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
} from '@/types/psd';
import { sideKeyOf } from '@/types/psd';
import type { DataRow, PhotoRecord } from '@/types/data';
import { loadImageElement } from './psdService';
import { resolveFontFamily } from './fontService';
import { fontCssFor } from './textStyleOracle';

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
  trackingPx: number
): string[] {
  const paragraphs = text.split(/\r\n|\r|\n/);
  const widthOf = (value: string): number =>
    context.measureText(value).width + trackingPx * Math.max(0, value.length - 1);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    if (maxWidth === Infinity) {
      lines.push(paragraph);
      continue;
    }
    // Split on spaces but KEEP the separators so multi-space runs survive.
    const pieces = paragraph.split(/(?<= )/);
    let current = '';
    for (const piece of pieces) {
      const candidate = current + piece;
      if (widthOf(candidate.trimEnd()) > maxWidth && current.trim().length > 0) {
        lines.push(current.trimEnd());
        current = piece.trimStart();
      } else {
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
}

/**
 * Style for one character index: the resolved run covering it (falls back
 * to the layer style / oracle when runs are absent or empty — the sample
 * PSD's deduplicated empty runs make the fallback the live path there).
 */
function resolveStyleAt(
  text: NonNullable<PsdLayerInfo['text']>,
  oracle: PsdTextStyleOracle | undefined,
  familyBold: boolean,
  familyItalic: boolean,
  index: number
): { fontSize: number; color: string; bold: boolean; italic: boolean } {
  const run = text.runs?.find((segment) => index >= segment.from && index < segment.to);
  const fallback: { fontSize: number; color: string; bold: boolean; italic: boolean } = {
    fontSize: oracle?.fontSize ?? text.fontSize ?? 18,
    color: text.color || '#000000',
    bold: oracle?.bold ?? text.bold ?? familyBold,
    italic: oracle?.italic ?? text.italic ?? familyItalic,
  };
  if (!run) return fallback;
  // Oracle wins on the PRIMARY sample layer (its raster knows the real
  // size/weight/slant/colour); run values fill engine-only properties.
  return {
    fontSize: oracle?.fontSize ?? run.fontSize ?? fallback.fontSize,
    color: run.color || fallback.color,
    bold: run.bold ?? fallback.bold,
    italic: run.italic ?? fallback.italic,
  };
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
  scale: number
): TextLayout {
  const text = layer.text!;
  const oracle = text.oracle;
  const fontSize = (oracle?.fontSize ?? text.fontSize ?? 18) * scale;
  const trackingPx =
    text.tracking !== undefined
      ? text.tracking * scale
      : (text.runs?.[0]?.tracking ?? 0) * scale;
  const justification = text.justification ?? 'left';
  const fontCssFamily = resolveFontFamily(text.fontFamily);

  const bounds = layer.bounds;
  const boxLeft = bounds.left * scale;
  const boxTop = bounds.top * scale;
  const boxWidth = Math.max(1, (bounds.right - bounds.left) * scale);
  const boxHeight = Math.max(1, (bounds.bottom - bounds.top) * scale);

  // Text origin: engine transform position when available, else the layer
  // bounds' top-left (older persisted layers without originX/Y).
  const textOriginX = (text.originX ?? bounds.left) * scale;
  const textOriginY = (text.originY ?? bounds.top) * scale;

  const metrics = context.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? fontSize * 0.8;

  // Wrap width: box text wraps at the REAL text box (which extends beyond
  // the sample's ink bounds); point text never width-wraps.
  const engineBoxWidth = (text.boxWidth ?? 0) * scale;
  const wrapWidth =
    text.shapeType === 'box' && engineBoxWidth > 1
      ? engineBoxWidth
      : Number.POSITIVE_INFINITY;
  const lines = wrapLinesPreserving(context, content, wrapWidth, trackingPx);

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

  // Leading: parsed (auto-leading already resolved to 1.2 × size at parse);
  // legacy layers without it fall back to 1.2 × size.
  const leading = (text.leading && text.leading > 0 ? text.leading : fontSize * 1.2) * scale;

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
  // canvas sizing and the painting share the same geometry.
  const lineX: number[] = [];
  const lineWidths: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.length === 0) {
      lineX.push(textOriginX);
      lineWidths.push(0);
      continue;
    }
    const lineStartIndex = lineStarts[index] ?? 0;
    const segments = buildLineSegments(text, line, lineStartIndex);
    const width = segments.reduce((total, segment) => {
      context.font = fontCssFor(
        segment.style.bold,
        segment.style.italic,
        segment.style.fontSize * scale,
        fontCssFamily
      );
      return total + context.measureText(segment.text).width + trackingPx * Math.max(0, segment.text.length - 1);
    }, 0);
    lineWidths.push(width);
    if (justification === 'center' || justification.startsWith('justify')) {
      if (text.shapeType === 'box' && boxWidth > 1) {
        lineX.push(textOriginX + (boxWidth - width) / 2);
      } else {
        lineX.push(textOriginX - width / 2);
      }
    } else if (justification === 'right') {
      lineX.push(textOriginX - width);
    } else {
      const originOffset = (oracle?.originOffsetX ?? 0) * scale;
      lineX.push(textOriginX + originOffset);
    }
  }

  return {
    lines,
    lineStarts,
    lineX,
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
  };
}

/** One painted style segment of a line (maximal run of equal style) */
interface GlyphSegment {
  text: string;
  style: { fontSize: number; color: string; bold: boolean; italic: boolean };
}

/**
 * Split a line into maximal same-style segments using the layer's resolved
 * runs. Without runs (or with ag-psd's empty deduplicated runs — the common
 * case) the whole line paints in the layer/oracle style as one segment.
 */
function buildLineSegments(
  text: NonNullable<PsdLayerInfo['text']>,
  line: string,
  lineStartIndex: number
): GlyphSegment[] {
  const styleAt = (index: number): GlyphSegment['style'] =>
    resolveStyleAt(text, text.oracle, text.bold ?? false, text.italic ?? false, index);
  if (!text.runs || text.runs.length === 0) {
    return [{ text: line, style: styleAt(lineStartIndex) }];
  }
  const segments: GlyphSegment[] = [];
  let offset = 0;
  while (offset < line.length) {
    const absolute = lineStartIndex + offset;
    const run = text.runs.find((entry) => absolute >= entry.from && absolute < entry.to);
    const runEndAbsolute = run ? Math.min(run.to, lineStartIndex + line.length) : lineStartIndex + line.length;
    const slice = line.slice(offset, runEndAbsolute - lineStartIndex);
    if (slice.length > 0) segments.push({ text: slice, style: styleAt(absolute) });
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
      previous.style.italic === segment.style.italic
    ) {
      previous.text += segment.text;
    } else {
      merged.push(segment);
    }
  }
  return merged.length > 0 ? merged : [{ text: line, style: styleAt(lineStartIndex) }];
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
  family: string
): void {
  const text = layer.text!;
  const effects = layer.effects;
  // Photoshop colour overlay (solidFill effect) replaces the text fill.
  const overlay = effects?.solidFill;
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
    const segments = buildLineSegments(text, line, lineStartIndex);
    const fontFor = (style: GlyphSegment['style']): string =>
      fontCssFor(style.bold, style.italic, style.fontSize * scale, family);
    const segmentWidth = (segment: GlyphSegment): number => {
      layerContext.font = fontFor(segment.style);
      return (
        layerContext.measureText(segment.text).width +
        layout.tracking * Math.max(0, segment.text.length - 1)
      );
    };
    // Geometry (start x, widths, justification) was decided ONCE in
    // computeTextLayout — the same source that sized the layer canvas.
    const x = layout.lineX[index]! - offsetX;
    const y = layout.firstBaseline + index * layout.leading - offsetY;

    const fillSegment = (segment: GlyphSegment, cursorX: number): void => {
      layerContext.font = fontFor(segment.style);
      if (layout.tracking === 0) {
        layerContext.fillText(segment.text, cursorX, y);
        return;
      }
      let cursor = cursorX;
      for (const character of segment.text) {
        layerContext.fillText(character, cursor, y);
        cursor += layerContext.measureText(character).width + layout.tracking;
      }
    };
    const strokeSegment = (segment: GlyphSegment, cursorX: number): void => {
      layerContext.font = fontFor(segment.style);
      if (layout.tracking === 0) {
        layerContext.strokeText(segment.text, cursorX, y);
        return;
      }
      let cursor = cursorX;
      for (const character of segment.text) {
        layerContext.strokeText(character, cursor, y);
        cursor += layerContext.measureText(character).width + layout.tracking;
      }
    };
    /** Shape-only painter for inner-effect compositing */
    const drawShape = (target: CanvasRenderingContext2D): void => {
      target.textBaseline = layerContext.textBaseline;
      let cursor = x;
      for (const segment of segments) {
        target.font = fontFor(segment.style);
        if (layout.tracking === 0) {
          target.fillText(segment.text, cursor, y);
        } else {
          let inner = cursor;
          for (const character of segment.text) {
            target.fillText(character, inner, y);
            inner += target.measureText(character).width + layout.tracking;
          }
        }
        cursor += segmentWidth(segment);
      }
    };

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

    // --- Main fill pass (per-segment colour; overlay replaces every fill).
    layerContext.save();
    if (overlay) layerContext.globalAlpha *= overlay.opacity;
    let cursor = x;
    for (const segment of segments) {
      layerContext.fillStyle = overlay ? overlay.color : segment.style.color;
      fillSegment(segment, cursor);
      cursor += segmentWidth(segment);
    }
    layerContext.restore();

    // --- Inner shadow / inner glow, intersected with the glyph shape.
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

    // --- Underline: a thin bar just below the baseline (Photoshop-like),
    // per segment so mixed-size runs get proportionate bars.
    if (text.underline) {
      layerContext.save();
      let underlineCursor = x;
      for (const segment of segments) {
        layerContext.fillStyle = overlay ? overlay.color : segment.style.color;
        const thickness = Math.max(1, segment.style.fontSize * scale * 0.05);
        layerContext.fillRect(underlineCursor, y + thickness, segmentWidth(segment), thickness);
        underlineCursor += segmentWidth(segment);
      }
      layerContext.restore();
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
  let layout: TextLayout;
  try {
    const measure = getMeasureContext();
    layout = computeTextLayout(measure, layer, content, scale);
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
    const width = layout.lineWidths[index] ?? 0;
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
    layout.family
  );

  // Layer/vector mask: keep only the masked part of the rendered text
  // (mask grayscale: white = keep). The mask bitmap is anchored at the
  // LAYER bounds (offset in design px × scale) inside the canvas —
  // unchanged semantics, now aligned to the union box origin.
  if (layer.maskCanvas) {
    const bounds = layer.bounds;
    const maskTop = (layer.maskOffset?.top ?? bounds.top) * scale - canvasTop;
    const maskLeft = (layer.maskOffset?.left ?? bounds.left) * scale - canvasLeft;
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(
      layer.maskCanvas,
      maskLeft,
      maskTop,
      Math.max(1, (bounds.right - bounds.left) * scale),
      Math.max(1, (bounds.bottom - bounds.top) * scale)
    );
    layerContext.globalCompositeOperation = 'source-over';
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
  if (layer.maskCanvas) {
    const maskTop = ((layer.maskOffset?.top ?? bounds.top) - bounds.top) * scale;
    const maskLeft = ((layer.maskOffset?.left ?? bounds.left) - bounds.left) * scale;
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(layer.maskCanvas, pad + maskLeft, pad + maskTop, dw, dh);
    layerContext.globalCompositeOperation = 'source-over';
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
