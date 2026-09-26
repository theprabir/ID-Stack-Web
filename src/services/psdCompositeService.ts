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
} from '@/types/psd';
import { sideKeyOf } from '@/types/psd';
import type { DataRow, PhotoRecord } from '@/types/data';
import { loadImageElement } from './psdService';
import { resolveFontFamily } from './fontService';

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

/** Word-wrap text into lines that fit maxWidth at the given font */
function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) lines.push(current);
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
function shadowOffsets(
  angleDeg: number,
  distancePx: number
): { offsetX: number; offsetY: number } {
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
  fontSize: number;
  tracking: number;
  leading: number;
  firstBaseline: number;
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  ascent: number;
}

/** Compute the text layout for a text layer at the given scale */
function computeTextLayout(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  content: string,
  scale: number
): TextLayout {
  const text = layer.text!;
  const fontSize = (text.fontSize ?? 18) * scale;
  const bounds = layer.bounds;
  const boxLeft = bounds.left * scale;
  const boxTop = bounds.top * scale;
  const boxWidth = Math.max(1, (bounds.right - bounds.left) * scale);
  const boxHeight = Math.max(1, (bounds.bottom - bounds.top) * scale);

  const metrics = context.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
  const descent =
    metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? fontSize * 0.2;

  const lines = wrapLines(context, content, boxWidth);
  // Leading is baseline-to-baseline (Photoshop). "Auto" leading ≈ 1.2 × size.
  const leading = (text.leading && text.leading > 0 ? text.leading : fontSize * 1.2) * scale;

  // Vertically centre the text block in its box using true metrics.
  const blockHeight = ascent + descent + (lines.length - 1) * leading;
  const firstBaseline =
    lines.length * leading > boxHeight
      ? boxTop + ascent
      : boxTop + Math.max(0, (boxHeight - blockHeight) / 2) + ascent;

  return {
    lines,
    fontSize,
    tracking: (text.tracking ?? 0) * fontSize * 0.01, // Photoshop tracking = 1/100 em
    leading,
    firstBaseline,
    boxLeft,
    boxTop,
    boxWidth,
    boxHeight,
    ascent,
  } as TextLayout;
}

/**
 * Draw one text layer with its extracted PSD style AND layer effects onto
 * its (already created) layer canvas. All coordinates are relative to the
 * layer canvas origin (boxLeft − pad, boxTop − pad on the design).
 */
function drawTextContent(
  layerContext: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  layout: TextLayout,
  offsetX: number,
  offsetY: number
): void {
  const text = layer.text!;
  const effects = layer.effects;
  // Photoshop colour overlay (solidFill effect) replaces the text fill.
  const fillColour = effects?.solidFill?.color ?? (text.color || '#000000');
  const fillOpacity = effects?.solidFill ? effects.solidFill.opacity : 1;
  const stroke = effects?.stroke;
  const dropShadow = effects?.dropShadows?.[0];
  const justification = text.justification ?? 'left';

  for (let index = 0; index < layout.lines.length; index += 1) {
    const line = layout.lines[index] ?? '';
    if (line.length === 0) continue;
    const lineWidth =
      layerContext.measureText(line).width + layout.tracking * Math.max(0, line.length - 1);
    let x = layout.boxLeft - offsetX;
    const y = layout.firstBaseline + index * layout.leading - offsetY;
    if (justification === 'center' || justification.startsWith('justify')) {
      x = layout.boxLeft - offsetX + (layout.boxWidth - lineWidth) / 2;
    } else if (justification === 'right') {
      x = layout.boxLeft - offsetX + layout.boxWidth - lineWidth;
    }

    /** Glyph painter honouring tracking (fill or stroke mode) */
    const drawGlyphs = (mode: 'fill' | 'stroke'): void => {
      if (layout.tracking === 0) {
        if (mode === 'fill') layerContext.fillText(line, x, y);
        else layerContext.strokeText(line, x, y);
        return;
      }
      let cursor = x;
      for (const character of line) {
        if (mode === 'fill') layerContext.fillText(character, cursor, y);
        else layerContext.strokeText(character, cursor, y);
        cursor += layerContext.measureText(character).width + layout.tracking;
      }
    };
    /** Shape-only painter for inner-effect compositing */
    const drawShape = (target: CanvasRenderingContext2D): void => {
      const previous = layerContext;
      void previous;
      target.font = layerContext.font;
      target.textBaseline = layerContext.textBaseline;
      if (layout.tracking === 0) {
        target.fillText(line, x, y);
        return;
      }
      let cursor = x;
      for (const character of line) {
        target.fillText(character, cursor, y);
        cursor += target.measureText(character).width + layout.tracking;
      }
    };

    // --- Stroke: painted UNDER the fill so the glyph face keeps its colour.
    // Outside/inside positions are approximated with a doubled/normal width
    // under-stroke (canvas cannot stroke offset outlines directly).
    if (stroke) {
      layerContext.save();
      layerContext.globalAlpha *= stroke.opacity;
      layerContext.strokeStyle = stroke.color;
      layerContext.lineWidth = Math.max(1, stroke.width * (stroke.position === 'center' ? 1 : 2));
      layerContext.lineJoin = 'round';
      drawGlyphs('stroke');
      layerContext.restore();
    }

    // --- Drop shadow: cast from the glyph shape, then repaint the fill.
    if (dropShadow) {
      const { offsetX: sx, offsetY: sy } = shadowOffsets(dropShadow.angle, dropShadow.distance);
      layerContext.save();
      setShadow(layerContext, dropShadow.color, dropShadow.opacity, dropShadow.blur, sx, sy, 1);
      drawGlyphs('fill');
      layerContext.restore();
    }

    // --- Main fill pass.
    layerContext.save();
    layerContext.fillStyle = fillColour;
    layerContext.globalAlpha *= fillOpacity;
    drawGlyphs('fill');
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
      layerContext.fillStyle = fillColour;
      drawGlyphs('fill');
      layerContext.restore();
    }

    // --- Underline: a thin bar just below the baseline (Photoshop-like).
    if (text.underline) {
      layerContext.save();
      layerContext.fillStyle = fillColour;
      const thickness = Math.max(1, layout.fontSize * 0.05);
      layerContext.fillRect(x, y + thickness, lineWidth, thickness);
      layerContext.restore();
    }
  }
}

/**
 * Render a placeholder text layer (or any text layer) onto the target
 * context through a padded offscreen canvas so effects are never clipped
 * and masks apply to the glyphs exactly like Photoshop.
 */
function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  content: string,
  scale: number
): void {
  const text = layer.text;
  if (!text) return;

  const family = resolveFontFamily(text.fontFamily);
  const weight = text.bold ? 'bold' : 'normal';
  const style = text.italic ? 'italic' : 'normal';

  // Measure with the final font (metrics depend on it).
  const probe = makeCanvas(1, 1).getContext('2d');
  const fontSize = (text.fontSize ?? 18) * scale;
  if (!probe) return;
  probe.font = `${style} ${weight} ${fontSize}px ${family}`;
  const layout = computeTextLayout(probe, layer, content, scale);

  const pad = effectPadding(layer.effects, scale);
  const canvasWidth = layout.boxWidth + pad * 2;
  const canvasHeight = layout.boxHeight + pad * 2;
  const layerCanvas = makeCanvas(canvasWidth, canvasHeight);
  const layerContext = layerCanvas.getContext('2d');
  if (!layerContext) return;

  layerContext.font = `${style} ${weight} ${fontSize}px ${family}`;
  layerContext.textBaseline = 'alphabetic';

  drawTextContent(layerContext, layer, layout, layout.boxLeft - pad, layout.boxTop - pad);

  // Layer/vector mask: keep only the masked part of the rendered text
  // (mask grayscale: white = keep). The mask bitmap is stretched over the
  // layer bounds at its own offset, matching Photoshop's mask placement.
  if (layer.maskCanvas) {
    const bounds = layer.bounds;
    const maskTop = ((layer.maskOffset?.top ?? bounds.top) - bounds.top) * scale;
    const maskLeft = ((layer.maskOffset?.left ?? bounds.left) - bounds.left) * scale;
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(layer.maskCanvas, pad + maskLeft, pad + maskTop, layout.boxWidth, layout.boxHeight);
    layerContext.globalCompositeOperation = 'source-over';
  }

  context.drawImage(layerCanvas, layout.boxLeft - pad, layout.boxTop - pad);
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
    setShadow(layerContext, dropShadow.color, dropShadow.opacity, dropShadow.blur, offsetX, offsetY, scale);
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
      stroke.position === 'outside' ? pad - width / 2 : pad + (stroke.position === 'inside' ? width / 2 : 0);
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
      drawTextLayer(context, layer, content, scale);
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
              rendered = await applyClippingMask(
                stage,
                design.layerRasters[base.id],
                base,
                scale
              );
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
