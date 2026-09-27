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
  TextStyle,
  LayerEffectsInfo,
  LayerMaskData,
} from 'ag-psd/dist/psd.d';
import { readPsdPatched, applyPsdColorModePatch } from './psdColorModePatch';
import type {
  PsdDesign,
  PsdLayerInfo,
  PsdLayerKind,
  SideType,
  PsdLayerEffects,
  PsdTextStyleOracle,
} from '@/types/psd';
import { measureCanvasInk, inkColorToHex } from './inkScan';
import {
  calibrateStyleFromRaster,
  measureSampleAnchor,
} from './textStyleOracle';
import type { PsdTextRun } from '@/types/psd';

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
 * Convert an engine text measurement (fontSize/leading/outlineWidth) to
 * design px. UNIT CONTRACT: plain numbers are pre-scaled PIXELS as Photoshop
 * drew them, still multiplied by the text transform's scale — verified
 * against the sample PSD ("Name" bounds 36 px = cap of 50 px Arial at
 * transform scale 1). Only genuine unit-tagged values ({units,value}, rare)
 * convert through the document DPI.
 */
function engineValueToDesignPx(
  value: unknown,
  dpi: number,
  transformScaleX: number,
  fallback = 0
): number {
  if (typeof value === 'number') return value * transformScaleX;
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return unitsValueToPx(value as { units: string; value: number }, dpi) * transformScaleX;
  }
  return fallback;
}

/**
 * Build the RENDER-TIME STYLE ORACLE for a text layer from its original
 * raster: the size/weight/slant/colour AND the exact ink position that
 * Photoshop actually rendered. Stored on the layer and applied VERBATIM at
 * render time — never re-derived per substituted string. Returns undefined
 * when the raster or environment cannot support calibration (caller falls
 * back to engine-data values).
 *
 * Also measures (when the environment can rasterise text) how the sample
 * string anchors relative to its ink box — ink-top→baseline and
 * origin→ink-left — so ANY substituted value is placed on Photoshop's true
 * baseline and start position, not merely sized like the sample.
 */
function buildTextStyleOracle(
  layer: Layer,
  fontFamily: string,
  layerLeft: number,
  layerTop: number,
  dpi: number
): PsdTextStyleOracle | undefined {
  if (!layer.canvas) return undefined;
  const content = layer.text?.text ?? '';
  if (content.length === 0 || /\r|\n/.test(content)) return undefined;
  const engineStyle = layer.text?.styleRuns?.[0]?.style ?? layer.text?.style;
  const engineFontSize = engineStyle?.fontSize;
  // Sanity band against the engine value in DESIGN px (identity transform;
  // the wide 0.2–6 band absorbs any real transform scale).
  const engineFontSizePx =
    engineFontSize !== undefined
      ? engineValueToDesignPx(engineFontSize, dpi, 1)
      : undefined;
  const match = calibrateStyleFromRaster(
    layer.canvas,
    content,
    fontFamily,
    engineFontSizePx
  );
  if (!match) return undefined;
  const raster = measureCanvasInk(layer.canvas);
  if (!raster) return undefined;
  // Sample anchoring: how the ORIGINAL string sits relative to its ink box
  // when drawn with real font metrics. Both offsets scale linearly with the
  // font size (measured at 100 px → design px here).
  const anchor = measureSampleAnchor(match.bold, match.italic, fontFamily, content);
  return {
    fontSize: match.fontSize,
    bold: match.bold,
    italic: match.italic,
    color: inkColorToHex(raster.meanColor) ?? undefined,
    // Ink box in DESIGN coordinates: layer canvas origin = (layer.left, layer.top).
    inkBox: {
      left: layerLeft + raster.inkLeft,
      top: layerTop + raster.inkTop,
      right: layerLeft + raster.inkRight,
      bottom: layerTop + raster.inkBottom,
    },
    baselineOffset: anchor ? (anchor.baselineOffset100 * match.fontSize) / 100 : undefined,
    originOffsetX: anchor ? (anchor.originOffsetX100 * match.fontSize) / 100 : undefined,
  };
}

/**
 * Extract faithful text info from a text layer.
 *
 * UNIT CONTRACT (verified against real PSDs and the ag-psd decoder): the
 * text engine's plain-number fontSize is already in design PIXELS as drawn
 * by Photoshop — but scaled by the text layer's own matrix. The drawn size
 * is fontSize × transform[0] (verified: "Name" bounds 36 px tall = cap
 * height of 50 px Arial; title bounds 62 px = cap+descender of 66.67 px
 * Arial, both at transform scale 1). Point-unit fontSize (rare) converts
 * through the document DPI. Treating plain numbers as points multiplies
 * every size by DPI/72 (≈4.17× at 300 dpi) — the historical size bug.
 *
 * Auto-leading: the engine stores a sentinel leading (e.g. 620) with
 * autoLeading=true; the REAL line spacing is 1.2 × font size (Photoshop's
 * 120 % auto-leading), never the sentinel value.
 */
function extractText(text: LayerTextData, dpi: number, layer: Layer): PsdLayerInfo['text'] {
  const firstStyle = text.styleRuns?.[0]?.style ?? text.style;
  const fontName = firstStyle?.font?.name ?? undefined;
  const color = agColorToCss(firstStyle?.fillColor);

  // Text-path transform: [a, b, c, d, tx, ty] — a/d scale the drawn text.
  const transform = text.transform ?? [1, 0, 0, 1, 0, 0];
  const transformScaleX =
    typeof transform[0] === 'number' && Math.abs(transform[0]) > 0.01 ? transform[0] : 1;
  const transformScaleY =
    typeof transform[3] === 'number' && Math.abs(transform[3]) > 0.01 ? transform[3] : 1;
  const autoLeading = firstStyle?.autoLeading === true;
  const engineFontSizePx =
    firstStyle?.fontSize !== undefined
      ? engineValueToDesignPx(firstStyle.fontSize, dpi, transformScaleX)
      : undefined;
  const engineBold = firstStyle?.fauxBold === true || /bold|black|heavy/i.test(fontName ?? '');
  const engineItalic = firstStyle?.fauxItalic === true || /italic|oblique/i.test(fontName ?? '');

  // Line spacing (design px): auto-leading = 1.2 × size (Photoshop 120 %);
  // otherwise the engine's leading value (plain numbers already px-scaled).
  const leading = autoLeading
    ? (engineFontSizePx ?? 0) * 1.2
    : firstStyle?.leading !== undefined
      ? engineValueToDesignPx(firstStyle.leading, dpi, transformScaleX)
      : undefined;

  // Text shape: 'box' wraps at the box width; 'point' never width-wraps.
  const shapeType = text.shapeType === 'box' ? 'box' : 'point';
  // boxBounds = [left, top, right, bottom] relative to the text origin.
  const boxBounds = text.boxBounds;
  const boxWidth =
    shapeType === 'box' && Array.isArray(boxBounds)
      ? Math.max(0, ((boxBounds[2] ?? 0) - (boxBounds[0] ?? 0)) * transformScaleX)
      : 0;
  const boxHeight =
    shapeType === 'box' && Array.isArray(boxBounds)
      ? Math.max(0, ((boxBounds[3] ?? 0) - (boxBounds[1] ?? 0)) * transformScaleY)
      : 0;

  // RENDER-TIME STYLE ORACLE: measure Photoshop's own raster of this layer
  // (size, weight, slant, colour, ink position) and store it on the layer.
  // drawTextLayer applies the oracle VERBATIM — substituted text uses the
  // original style and geometry; it is never re-derived per string.
  const oracle = buildTextStyleOracle(
    layer,
    fontName ?? 'sans-serif',
    layer.left ?? 0,
    layer.top ?? 0,
    dpi
  );

  // Resolved per-character style segments (renderer-ready design px/CSS).
  // Runs of 0 length (ag-psd dedupe artefacts) and layer-style fallbacks are
  // applied so the renderer can paint each segment verbatim.
  const runs: PsdTextRun[] | undefined = text.styleRuns
    ? resolveStyleRuns(
        text.styleRuns,
        text.style,
        {
          fontSizePx: engineFontSizePx,
          color,
          bold: engineBold,
          italic: engineItalic,
          underline: firstStyle?.underline === true,
          trackingPx:
            firstStyle?.tracking !== undefined
              ? (firstStyle.tracking / 1000) * (engineFontSizePx ?? 0)
              : undefined,
        },
        dpi,
        transformScaleX
      )
    : undefined;

  // Engine TEXT stroke (character panel outline): only when the layer
  // actually enables it. The sample PSD stores strokeFlag=false with a
  // non-zero outlineWidth — a stroke must NOT be drawn for it.
  const strokeColorCss = agColorToCss(firstStyle?.strokeColor);
  const engineStrokeWidth =
    firstStyle?.outlineWidth !== undefined
      ? engineValueToDesignPx(firstStyle.outlineWidth, dpi, transformScaleX)
      : 0;

  return {
    content: text.text,
    fontSize: oracle?.fontSize ?? engineFontSizePx,
    fontFamily: fontName,
    color: oracle?.color ?? (color || undefined),
    bold: oracle?.bold ?? engineBold,
    italic: oracle?.italic ?? engineItalic,
    oracle,
    justification: text.paragraphStyle?.justification ?? 'left',
    underline: firstStyle?.underline === true,
    tracking:
      firstStyle?.tracking !== undefined
        ? (firstStyle.tracking / 1000) * (engineFontSizePx ?? 0)
        : undefined,
    leading: leading !== undefined && leading > 0 ? leading : undefined,
    autoLeading,
    shapeType,
    boxWidth,
    boxHeight,
    originX: transform[4],
    originY: transform[5],
    runs,
    strokeColor: strokeColorCss || undefined,
    strokeWidth:
      firstStyle?.strokeFlag === true && engineStrokeWidth > 0 ? engineStrokeWidth : undefined,
  };
}

/** Layer-level text style values used as the fallback for style runs */
interface LayerStyleFallback {
  fontSizePx: number | undefined;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  trackingPx: number | undefined;
}

/**
 * Convert ag-psd style runs (length + partial style, unit-tagged sizes)
 * into resolved renderer-ready segments covering the full string. Styles
 * missing from a run fall back to the layer-level style; tracking converts
 * from thousandths-of-em to px per the run's own font size.
 */
function resolveStyleRuns(
  styleRuns: { length: number; style: TextStyle }[],
  layerStyle: TextStyle | undefined,
  fallback: LayerStyleFallback,
  dpi: number,
  transformScale: number
): PsdTextRun[] {
  const runs: PsdTextRun[] = [];
  let cursor = 0;
  for (const run of styleRuns) {
    const from = cursor;
    const to = cursor + Math.max(0, run.length);
    cursor = to;
    if (to <= from) continue;
    const style = run.style ?? {};
    const runFontSizePx =
      style.fontSize !== undefined
        ? engineValueToDesignPx(style.fontSize, dpi, transformScale)
        : fallback.fontSizePx;
    const trackingPx =
      style.tracking !== undefined
        ? (style.tracking / 1000) * (runFontSizePx ?? 0)
        : fallback.trackingPx;
    runs.push({
      from,
      to,
      fontSize: runFontSizePx,
      color: agColorToCss(style.fillColor) || fallback.color,
      bold: style.fauxBold ?? fallback.bold,
      italic: style.fauxItalic ?? fallback.italic,
      underline: style.underline ?? fallback.underline,
      tracking: trackingPx,
    });
  }
  if (cursor === 0 && layerStyle) {
    // No usable runs — one segment covering "the whole string" (length is
    // unknown here; the renderer clamps it to the content length).
    runs.push({
      from: 0,
      to: Number.MAX_SAFE_INTEGER,
      fontSize: fallback.fontSizePx,
      color: fallback.color,
      bold: fallback.bold,
      italic: fallback.italic,
      underline: fallback.underline,
      tracking: fallback.trackingPx,
    });
  }
  return runs;
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
