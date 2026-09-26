/**
 * PSD parsing service (ag-psd).
 * Parses .psd files, flattens the layer tree, extracts text styles and
 * rasterises layers so the design can be re-composited pixel-perfect with
 * only placeholder content replaced.
 */
import type {
  Layer,
  Psd,
  LayerTextData,
  Color,
  LayerEffectsInfo,
  LayerMaskData,
} from 'ag-psd/dist/psd.d';
import { readPsdPatched, applyPsdColorModePatch } from './psdColorModePatch';
import type { PsdDesign, PsdLayerInfo, PsdLayerKind, SideType, PsdLayerEffects } from '@/types/psd';

// Enable CMYK PSD files (print standard). ag-psd converts CMYK→RGB internally
// but gates the color mode behind a whitelist; the patch extends it.
applyPsdColorModePatch();

/**
 * Convert an ag-psd Color union to a CSS color string ('' when unknown).
 * CMYK fills use the same naive conversion ag-psd applies when rasterising
 * CMYK pixels, so re-rendered text matches the Photoshop raster exactly.
 */
export function agColorToCss(color: Color | undefined): string {
  if (!color) return '';
  if ('r' in color && 'g' in color && 'b' in color) {
    const alpha = 'a' in color && typeof color.a === 'number' ? color.a / 255 : 1;
    const hex = (value: number): string =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0');
    const base = `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
    return alpha < 1 ? `${base}${hex(alpha * 255)}` : base;
  }
  if ('fr' in color && 'fg' in color && 'fb' in color) {
    const hex = (value: number): string =>
      Math.max(0, Math.min(255, Math.round(value * 255)))
        .toString(16)
        .padStart(2, '0');
    return `#${hex(color.fr)}${hex(color.fg)}${hex(color.fb)}`;
  }
  // CMYK text fill: {c, m, y, k} on a 0–255 scale (Photoshop engine data).
  // R = 255·(1−C)·(1−K) etc. — matches ag-psd's rasterised text pixels.
  if ('c' in color && 'm' in color && 'y' in color && 'k' in color) {
    const { c, m, y, k } = color as { c: number; m: number; y: number; k: number };
    const channel = (component: number): string =>
      Math.max(0, Math.min(255, Math.round(255 * (1 - component / 255) * (1 - k / 255))))
        .toString(16)
        .padStart(2, '0');
    return `#${channel(c)}${channel(m)}${channel(y)}`;
  }
  return '';
}

/** Convert a UnitsValue ({units, value}) or number to plain pixels.
 * Plain numbers and 'Pixels' units are already design pixels; physical
 * units (points/mm/cm/inches/picas) convert through the design DPI so a
 * 300-DPI document's 10 pt shadow distance becomes 10/72×300 ≈ 41.7 px. */
function unitsValueToPx(value: unknown, dpi: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const { units, value: raw } = value as { units?: string; value: number };
    switch (units) {
      case 'Points':
        return (raw / 72) * dpi;
      case 'Millimeters':
        return (raw / 25.4) * dpi;
      case 'Centimeters':
        return (raw / 2.54) * dpi;
      case 'Inches':
        return raw * dpi;
      case 'Picas':
        return ((raw * 12) / 72) * dpi;
      default: // 'Pixels' (and anything unknown) — already design pixels
        return raw;
    }
  }
  return 0;
}

/**
 * Extract the layer's Photoshop layer effects (stroke, shadows, glows,
 * overlays) in a serialisable, renderer-agnostic form. Disabled effects and
 * absent values are dropped so the renderer only ever sees live effects.
 * Effect sizes/distances arrive as physical units (points/mm/…); they are
 * normalised to design pixels at the document DPI so substituted content
 * keeps the exact effect geometry at any document resolution.
 *
 * @param effects - ag-psd layer effects (may be undefined)
 * @param dpi - Document resolution in pixels per inch (default 72)
 * @returns Normalised effects object, or undefined when nothing is enabled
 */
export function extractLayerEffects(
  effects?: LayerEffectsInfo,
  dpi = 72
): PsdLayerEffects | undefined {
  if (!effects || effects.disabled === true) return undefined;

  const out: PsdLayerEffects = {};
  let any = false;

  const enabled = (effect: { enabled?: boolean; present?: boolean } | undefined): boolean =>
    effect !== undefined && effect.enabled !== false && effect.present !== false;

  for (const shadow of effects.dropShadow ?? []) {
    if (!enabled(shadow)) continue;
    any = true;
    (out.dropShadows ??= []).push({
      color: agColorToCss(shadow.color) || '#000000',
      opacity: shadow.opacity ?? 1,
      angle: shadow.angle ?? 120,
      distance: unitsValueToPx(shadow.distance, dpi),
      blur: unitsValueToPx(shadow.size, dpi) / 2, // Photoshop size ≈ diameter → canvas blur radius
    });
  }

  for (const shadow of effects.innerShadow ?? []) {
    if (!enabled(shadow)) continue;
    any = true;
    (out.innerShadows ??= []).push({
      color: agColorToCss(shadow.color) || '#000000',
      opacity: shadow.opacity ?? 1,
      angle: shadow.angle ?? 120,
      distance: unitsValueToPx(shadow.distance, dpi),
      blur: unitsValueToPx(shadow.size, dpi) / 2,
    });
  }

  if (enabled(effects.outerGlow)) {
    any = true;
    const glow = effects.outerGlow!;
    out.outerGlow = {
      color: agColorToCss(glow.color) || '#ffffff',
      opacity: glow.opacity ?? 1,
      blur: unitsValueToPx(glow.size, dpi) / 2,
    };
  }

  if (enabled(effects.innerGlow)) {
    any = true;
    const glow = effects.innerGlow!;
    out.innerGlow = {
      color: agColorToCss(glow.color) || '#ffffff',
      opacity: glow.opacity ?? 1,
      blur: unitsValueToPx(glow.size, dpi) / 2,
    };
  }

  for (const stroke of effects.stroke ?? []) {
    if (!enabled(stroke)) continue;
    any = true;
    out.stroke = {
      color: agColorToCss(stroke.color) || '#000000',
      width: unitsValueToPx(stroke.size, dpi),
      position: stroke.position ?? 'outside',
      opacity: stroke.opacity ?? 1,
    };
  }

  for (const fill of effects.solidFill ?? []) {
    if (!enabled(fill)) continue;
    any = true;
    out.solidFill = { color: agColorToCss(fill.color) || '#000000', opacity: fill.opacity ?? 1 };
  }

  return any ? out : undefined;
}

/** Extract a layer's mask pixel data (layer + vector masks) as a canvas */
function extractMaskCanvas(mask?: LayerMaskData): HTMLCanvasElement | undefined {
  if (!mask || mask.disabled === true) return undefined;
  if (mask.canvas) return mask.canvas;
  if (mask.imageData) {
    const { data, width, height } = mask.imageData;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    return canvas;
  }
  return undefined;
}

/** Determine the kind of a layer */
function layerKind(layer: Layer): PsdLayerKind {
  if (layer.text !== undefined) return 'text';
  if (layer.children !== undefined) return 'group';
  if (layer.canvas !== undefined || layer.imageData !== undefined) {
    // Vector shapes come with canvas pixels too — treat as image; the
    // visual result is identical either way.
    return 'image';
  }
  return 'other';
}

/** True when the layer carries non-default Photoshop effects */
function hasLayerEffects(layer: Layer): boolean {
  const effects = layer.effects;
  if (!effects) return false;
  return Boolean(
    (effects.dropShadow && effects.dropShadow.some((effect) => effect.enabled !== false)) ||
    (effects.innerShadow && effects.innerShadow.some((effect) => effect.enabled !== false)) ||
    (effects.outerGlow && effects.outerGlow.enabled !== false) ||
    (effects.innerGlow && effects.innerGlow.enabled !== false) ||
    (effects.stroke && effects.stroke.some((effect) => effect.enabled !== false)) ||
    (effects.solidFill && effects.solidFill.length > 0) ||
    (effects.gradientOverlay !== undefined && effects.gradientOverlay.length > 0) ||
    effects.patternOverlay !== undefined ||
    effects.bevel !== undefined ||
    effects.satin !== undefined
  );
}

/**
 * Convert a font measurement from points (Photoshop engine-data unit) to
 * design pixels at the document resolution. At 72 dpi this is the identity.
 */
function pointsToDesignPx(points: number, dpi: number): number {
  return (points / 72) * dpi;
}

/**
 * Measure the INK HEIGHT of a layer's rasterized pixels: how far the
 * topmost opaque row extends down to the bottommost opaque row, in layer
 * pixels. This is the GROUND TRUTH for how tall the layer's rendered
 * content is in the design — Photoshop itself drew these pixels.
 *
 * Used to self-calibrate placeholder text size: whatever the engine data's
 * unit quirks, the re-rendered text must visually match the raster the PSD
 * shows for the same layer.
 *
 * @param layer - ag-psd layer with canvas or imageData pixels
 * @returns Ink height in pixels, or null when the layer has no pixels,
 *          is empty (fully transparent), or is absurdly tall (multi-line
 *          blocks whose ink height is not a single line height).
 */
function measureInkHeight(layer: Layer): number | null {
  const canvas = layer.canvas;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  // Never sample huge rasters — a multi-line paragraph's ink height spans
  // several lines and would over-estimate the font size. Cap at 4× the
  // width as a cheap multi-line/paragraph heuristic (single lines are wide
  // relative to height; paragraphs are not).
  if (canvas.height > canvas.width * 4) return null;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height && top === -1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3]! > 8) {
          top = y;
          break;
        }
      }
    }
    if (top === -1) return null; // fully transparent
    for (let y = canvas.height - 1; y >= 0 && bottom === -1; y -= 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3]! > 8) {
          bottom = y;
          break;
        }
      }
    }
    const inkHeight = bottom - top + 1;
    // Guard against degenerate values (a 1-2 px sliver is not a font).
    return inkHeight >= 4 ? inkHeight : null;
  } catch {
    return null;
  }
}

/**
 * Estimate the single-line ink height of a text string at 100 px font size
 * in a given font: the distance from the topmost to the bottommost opaque
 * pixel when drawn on a canvas. Measured ONCE PER FONT (cached) so the
 * calibration loop stays cheap even for designs with many text layers.
 *
 * The ratio inkHeight/fontSize is the calibration constant that converts a
 * measured raster ink height back into the font size Photoshop used.
 *
 * @param fontCss - Full canvas font string at 100 px size
 * @returns Ink height in px at 100 px font size (≈ 70–100 for most fonts)
 */
function measureFontInkHeight100(fontCss: string): number {
  const cached = fontInkCache.get(fontCss);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 75; // sane default (most fonts ≈ 0.72–0.78 em ink)
  context.font = fontCss;
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000';
  context.fillText('Hxpg', 10, 150); // includes ascender (H) + descender (p,g)
  const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height && top === -1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        top = y;
        break;
      }
    }
  }
  for (let y = canvas.height - 1; y >= 0 && bottom === -1; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        bottom = y;
        break;
      }
    }
  }
  const inkHeight = top === -1 || bottom === -1 ? 75 : bottom - top + 1;
  fontInkCache.set(fontCss, inkHeight);
  return inkHeight;
}

/** Per-font ink-height cache (key: canvas font string at 100 px) */
const fontInkCache = new Map<string, number>();

/**
 * Self-calibrate a text layer's font size against Photoshop's own raster:
 *
 * 1. Measure the ink height of the layer's ORIGINAL rasterized pixels
 *    (Photoshop's ground truth for how tall this text renders).
 * 2. Measure how tall the same text renders at a reference 100 px in the
 *    resolved font (via canvas).
 * 3. fontPx = rasterInkHeight × (100 / referenceInkHeight100).
 *
 * This makes the substituted text's visual size INDEPENDENT of the engine
 * data's unit conventions (points vs pixels vs scaled transforms): the
 * raster IS what Photoshop displays, so matching it cannot be wrong.
 * Only single-line text calibrates (multi-line ink spans several lines and
 * would over-estimate); everything else keeps the engine-data size.
 *
 * @param layer - ag-psd layer (text + raster pixels)
 * @param engineFontSizePx - Engine-data-derived font size in design px
 * @param fontCssFamily - Resolved CSS font family for measurement
 * @param bold - Faux bold flag (affects ink weight/height slightly)
 * @param italic - Faux italic flag
 * @returns Calibrated font size in design pixels, or the engine value when
 *          calibration is impossible (no pixels, multi-line, degenerate)
 */
function calibrateFontSizeFromRaster(
  layer: Layer,
  engineFontSizePx: number | undefined,
  fontCssFamily: string,
  bold: boolean,
  italic: boolean
): number | undefined {
  const rasterInk = measureInkHeight(layer);
  if (rasterInk === null) return engineFontSizePx;
  const referenceFont = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}100px ${fontCssFamily}`;
  const referenceInk100 = measureFontInkHeight100(referenceFont);
  if (referenceInk100 <= 10) return engineFontSizePx; // measurement failed
  const calibrated = (rasterInk * 100) / referenceInk100;
  // Sanity guard: calibrated must be within a wide band of the engine value
  // (units quirks produce 1×, 4.17×, 0.24×, … but never 50×). Outside the
  // band the calibration itself is untrustworthy — keep the engine value.
  if (engineFontSizePx !== undefined && engineFontSizePx > 0) {
    const ratio = calibrated / engineFontSizePx;
    if (ratio < 0.2 || ratio > 6) return engineFontSizePx;
  }
  return calibrated;
}

/**
 * Extract faithful text info from a text layer.
 *
 * UNIT CONTRACT: the Photoshop text engine stores fontSize/leading in
 * POINTS regardless of the document ruler unit, while layer bounds are in
 * design PIXELS. Both are normalised to design pixels here (using the
 * document DPI) so the composite renderer can draw px-for-px: a 12 pt font
 * on a 300-DPI doc becomes 50 px, matching the raster scale of every other
 * layer. Getting this wrong renders placeholder text ~DPI/72× too small.
 */
function extractText(text: LayerTextData, dpi: number, layer: Layer): PsdLayerInfo['text'] {
  const firstStyle = text.styleRuns?.[0]?.style ?? text.style;
  const fontName = firstStyle?.font?.name ?? undefined;
  const color = agColorToCss(firstStyle?.fillColor);
  const justification = text.paragraphStyle?.justification ?? 'left';

  const fontSizePt =
    firstStyle?.fontSize !== undefined ? unitsValueToPx(firstStyle.fontSize, dpi) : undefined;
  const leadingPt =
    firstStyle?.leading !== undefined ? unitsValueToPx(firstStyle.leading, dpi) : undefined;

  const bold = firstStyle?.fauxBold === true || /bold|black|heavy/i.test(fontName ?? '');
  const italic = firstStyle?.fauxItalic === true || /italic|oblique/i.test(fontName ?? '');
  const engineFontSizePx = fontSizePt !== undefined ? pointsToDesignPx(fontSizePt, dpi) : undefined;
  // SELF-CALIBRATION: Photoshop's own rasterized pixels of this layer are
  // the ground truth for how big the text should render. Engine-data unit
  // conventions vary (points/pixels/transforms) and have repeatedly produced
  // wrong sizes; matching the raster cannot be wrong. Falls back to the
  // engine value when the layer has no usable pixels.
  const fontSize = calibrateFontSizeFromRaster(
    layer,
    engineFontSizePx,
    fontName ?? 'sans-serif',
    bold,
    italic
  );

  return {
    content: text.text,
    fontSize,
    fontFamily: fontName,
    color: color || undefined,
    bold,
    italic,
    underline: firstStyle?.underline === true,
    tracking: firstStyle?.tracking,
    leading: leadingPt !== undefined ? pointsToDesignPx(leadingPt, dpi) : undefined,
    justification,
    // Preserve every run so re-rendered text keeps mixed styling.
    styleRuns: text.styleRuns?.map((run) => ({
      from: 0,
      to: run.length,
      style: run.style as unknown as Record<string, unknown>,
    })),
  };
}

/** Flatten the layer tree into a display list (top-most first) */
function flattenLayers(
  children: Layer[],
  ancestors: string[],
  side: SideType,
  dpi: number,
  out: PsdLayerInfo[]
): void {
  // ag-psd returns children top-most first, same as Photoshop's panel.
  for (const layer of children) {
    const path: string[] = [...ancestors, layer.name ?? 'Layer'];
    const id = `${side}/${path.join('/')}`;
    const kind = layerKind(layer);
    const bounds = {
      left: layer.left ?? 0,
      top: layer.top ?? 0,
      right: layer.right ?? layer.left ?? 0,
      bottom: layer.bottom ?? layer.top ?? 0,
    };
    const info: PsdLayerInfo = {
      id,
      name: layer.name ?? 'Layer',
      path: [...path],
      kind,
      hidden: layer.hidden === true,
      bounds,
      opacity: layer.opacity ?? 1,
      blendMode: layer.blendMode ?? 'normal',
      hasPixels: layer.canvas !== undefined || layer.imageData !== undefined,
      hasEffects: hasLayerEffects(layer),
      clipped: layer.clipping === true,
      childCount: layer.children?.length ?? 0,
    };
    if (layer.text !== undefined) {
      info.text = extractText(layer.text, dpi, layer);
    }
    // Effects + masks travel with the layer so placeholders re-render with
    // the exact Photoshop styling (stroke/shadow/glow/overlay/mask clip).
    const effects = extractLayerEffects(layer.effects, dpi);
    if (effects) info.effects = effects;
    const maskCanvas = extractMaskCanvas(layer.mask);
    if (maskCanvas) {
      info.maskCanvas = maskCanvas;
      info.maskOffset = {
        top: layer.mask?.top ?? bounds.top,
        left: layer.mask?.left ?? bounds.left,
      };
    }
    const realMaskCanvas = extractMaskCanvas(layer.realMask);
    if (realMaskCanvas && !info.maskCanvas) {
      info.maskCanvas = realMaskCanvas;
      info.maskOffset = {
        top: layer.realMask?.top ?? bounds.top,
        left: layer.realMask?.left ?? bounds.left,
      };
    }
    info.clipped = layer.clipping === true;
    out.push(info);
    if (layer.children) {
      flattenLayers(layer.children, path, side, dpi, out);
    }
  }
}

/** Rasterise a layer's canvas (or raw image data) into a blob URL */
async function layerToBlobUrl(layer: Layer): Promise<string | null> {
  let canvas: HTMLCanvasElement | undefined = layer.canvas;
  if (!canvas && layer.imageData) {
    const { data, width, height } = layer.imageData;
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const clamped = new Uint8ClampedArray(data);
    context.putImageData(new ImageData(clamped, width, height), 0, 0);
  }
  if (!canvas) return null;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null);
    }, 'image/png');
  });
}

/** Render an ImageBitmap-free load of a blob URL */
async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 48)}…`));
    image.src = url;
  });
}

export { loadImageElement };

/**
 * Test hook: exposes the module-private extractText (with raster
 * self-calibration) so regression tests can verify the font-size maths
 * without forging a full PSD file. Not part of the app's public API.
 */
export function extractTextForTest(
  text: LayerTextData,
  dpi: number,
  layer: Layer
): ReturnType<typeof extractText> {
  return extractText(text, dpi, layer);
}

/**
 * Parse a .psd file into a design descriptor.
 *
 * @param file - The .psd file
 * @param side - Which card face this design is for
 * @returns Parsed design with layer list, composite and per-layer rasters
 * @throws Error when the file is not a valid PSD
 */
export async function parsePsdFile(file: File, side: SideType): Promise<PsdDesign> {
  const buffer = await file.arrayBuffer();
  let psd: Psd;
  try {
    psd = readPsdPatched(buffer, {
      // Layer rasters are needed for compositing; skip only heavyweight extras.
      skipThumbnail: true,
      skipLinkedFilesData: true,
    }) as Psd;
  } catch (error) {
    throw new Error(
      `Could not parse "${file.name}": ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!psd.children || psd.children.length === 0) {
    throw new Error(
      `"${file.name}" has no layers. Flatten designs are not usable — please provide a layered PSD.`
    );
  }

  // Design resolution (PPI) FIRST — font sizes and effect distances are
  // normalised to design pixels through it. ag-psd reports PPI directly in
  // the ResolutionInfo image resource; sane-guard against absurd/absent
  // values (72 = screen, 1 px = 1 pt).
  const rawResolution =
    (psd.imageResources?.resolutionInfo?.horizontalResolution as number | undefined) ?? 72;
  // PPCM → PPI when the file declares centimetre units.
  const resolutionUnit = psd.imageResources?.resolutionInfo?.horizontalResolutionUnit;
  const resolutionPpi = resolutionUnit === 'PPCM' ? rawResolution * 2.54 : rawResolution;
  const horizontalResolution =
    Number.isFinite(resolutionPpi) && resolutionPpi >= 36 && resolutionPpi <= 2400
      ? resolutionPpi
      : 72;

  const layers: PsdLayerInfo[] = [];
  flattenLayers(psd.children, [], side, horizontalResolution, layers);

  // Composite preview of the whole design.
  let compositeUrl = '';
  if (psd.canvas) {
    compositeUrl = await new Promise<string>((resolve) => {
      psd.canvas!.toBlob((blob) => {
        resolve(blob ? URL.createObjectURL(blob) : '');
      }, 'image/png');
    });
  }

  // Per-layer rasters for compositing at generation time.
  const layerRasters: Record<string, string> = {};
  const collect = async (children: Layer[], ancestors: string[]): Promise<void> => {
    for (const layer of children) {
      const path: string[] = [...ancestors, layer.name ?? 'Layer'];
      const id = `${side}/${path.join('/')}`;
      if (layer.canvas !== undefined || layer.imageData !== undefined) {
        const url = await layerToBlobUrl(layer);
        if (url) layerRasters[id] = url;
      }
      if (layer.children) await collect(layer.children, path);
    }
  };
  await collect(psd.children, []);

  return {
    fileName: file.name,
    width: psd.width,
    height: psd.height,
    horizontalResolution,
    layers,
    compositeUrl,
    layerRasters,
  };
}
