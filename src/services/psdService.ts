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
import type {
  PsdDesign,
  PsdLayerInfo,
  PsdLayerKind,
  SideType,
  PsdLayerEffects,
} from '@/types/psd';

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

/** Convert a UnitsValue ({units, value}) or number to plain pixels */
function unitsToPx(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: number }).value;
  }
  return 0;
}

/**
 * Extract the layer's Photoshop layer effects (stroke, shadows, glows,
 * overlays) in a serialisable, renderer-agnostic form. Disabled effects and
 * absent values are dropped so the renderer only ever sees live effects.
 *
 * @param effects - ag-psd layer effects (may be undefined)
 * @returns Normalised effects object, or undefined when nothing is enabled
 */
export function extractLayerEffects(effects?: LayerEffectsInfo): PsdLayerEffects | undefined {
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
      distance: unitsToPx(shadow.distance),
      blur: unitsToPx(shadow.size) / 2, // Photoshop size ≈ diameter → canvas blur radius
    });
  }

  for (const shadow of effects.innerShadow ?? []) {
    if (!enabled(shadow)) continue;
    any = true;
    (out.innerShadows ??= []).push({
      color: agColorToCss(shadow.color) || '#000000',
      opacity: shadow.opacity ?? 1,
      angle: shadow.angle ?? 120,
      distance: unitsToPx(shadow.distance),
      blur: unitsToPx(shadow.size) / 2,
    });
  }

  if (enabled(effects.outerGlow)) {
    any = true;
    const glow = effects.outerGlow!;
    out.outerGlow = {
      color: agColorToCss(glow.color) || '#ffffff',
      opacity: glow.opacity ?? 1,
      blur: unitsToPx(glow.size) / 2,
    };
  }

  if (enabled(effects.innerGlow)) {
    any = true;
    const glow = effects.innerGlow!;
    out.innerGlow = {
      color: agColorToCss(glow.color) || '#ffffff',
      opacity: glow.opacity ?? 1,
      blur: unitsToPx(glow.size) / 2,
    };
  }

  for (const stroke of effects.stroke ?? []) {
    if (!enabled(stroke)) continue;
    any = true;
    out.stroke = {
      color: agColorToCss(stroke.color) || '#000000',
      width: unitsToPx(stroke.size),
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

/** Extract faithful text info from a text layer */
function extractText(text: LayerTextData): PsdLayerInfo['text'] {
  const firstStyle = text.styleRuns?.[0]?.style ?? text.style;
  const fontName = firstStyle?.font?.name ?? undefined;
  const color = agColorToCss(firstStyle?.fillColor);
  const justification = text.paragraphStyle?.justification ?? 'left';

  return {
    content: text.text,
    fontSize: firstStyle?.fontSize !== undefined ? unitsToPx(firstStyle.fontSize) : undefined,
    fontFamily: fontName,
    color: color || undefined,
    bold: firstStyle?.fauxBold === true || /bold|black|heavy/i.test(fontName ?? ''),
    italic: firstStyle?.fauxItalic === true || /italic|oblique/i.test(fontName ?? ''),
    underline: firstStyle?.underline === true,
    tracking: firstStyle?.tracking,
    leading: firstStyle?.leading !== undefined ? unitsToPx(firstStyle.leading) : undefined,
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
      info.text = extractText(layer.text);
    }
    // Effects + masks travel with the layer so placeholders re-render with
    // the exact Photoshop styling (stroke/shadow/glow/overlay/mask clip).
    const effects = extractLayerEffects(layer.effects);
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
      flattenLayers(layer.children, path, side, out);
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

  const layers: PsdLayerInfo[] = [];
  flattenLayers(psd.children, [], side, layers);

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
    layers,
    compositeUrl,
    layerRasters,
  };
}
