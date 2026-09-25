/**
 * PSD compositing service.
 * Re-renders a parsed PSD design onto a canvas with placeholder layers
 * substituted by row data (text) or photos — everything else is drawn
 * from the original layer rasters, untouched, in original order with
 * original opacity/blend modes. Text keeps the extracted PSD style
 * (font, size, color, tracking, justification).
 */
import type { PsdDesign, PsdPlaceholder, PsdLayerInfo } from '@/types/psd';
import { sideKeyOf } from '@/types/psd';
import type { DataRow, PhotoRecord } from '@/types/data';
import { loadImageElement } from './psdService';

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

/** Draw one text layer with its extracted PSD style */
function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: PsdLayerInfo,
  content: string,
  scale: number
): void {
  const text = layer.text;
  if (!text) return;

  const fontSize = (text.fontSize ?? 18) * scale;
  const family = text.fontFamily ? `"${text.fontFamily}"` : 'sans-serif';
  const weight = text.bold ? 'bold' : 'normal';
  const style = text.italic ? 'italic' : 'normal';
  context.font = `${style} ${weight} ${fontSize}px ${family}`;
  context.fillStyle = text.color || '#000000';
  context.textBaseline = 'top';

  const tracking = (text.tracking ?? 0) * fontSize * 0.01; // Photoshop tracking = 1/100 em

  const bounds = layer.bounds;
  const boxLeft = bounds.left * scale;
  const boxWidth = Math.max(1, (bounds.right - bounds.left) * scale);
  const boxTop = bounds.top * scale;
  const boxHeight = (bounds.bottom - bounds.top) * scale;

  const lines = wrapLines(context, content, boxWidth);
  const leading = text.leading ?? fontSize * 1.2;
  const lineHeight = leading * scale;
  const startY = boxTop + Math.max(0, (boxHeight - lines.length * lineHeight) / 2);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.length === 0) continue;
    const lineWidth = context.measureText(line).width + tracking * Math.max(0, line.length - 1);
    let x = boxLeft;
    const y = startY + index * lineHeight;
    const justification = text.justification ?? 'left';
    if (justification === 'center' || justification.startsWith('justify')) {
      x = boxLeft + (boxWidth - lineWidth) / 2;
    } else if (justification === 'right') {
      x = boxLeft + boxWidth - lineWidth;
    }

    if (tracking === 0) {
      context.fillText(line, x, y);
    } else {
      // Manual per-character spacing to honour tracking.
      let cursor = x;
      for (const character of line) {
        context.fillText(character, cursor, y);
        cursor += context.measureText(character).width + tracking;
      }
    }
  }
}

/** Draw a photo into the placeholder layer's bounds (centre-crop) */
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
    // Keep the design untouched when no photo matched — draw the original
    // raster (sample face) so the placeholder area is not blank.
    return;
  }

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
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, dx, dy, dw, dh);
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

  // Top-most first (ag-psd order). Paint back-to-front, so reverse.
  const layers = [...design.layers].reverse();

  for (const layer of layers) {
    if (layer.hidden) continue;
    if (layer.kind === 'group') continue; // groups contribute no pixels

    const placeholder = placeholderByLayer.get(layer.id);
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = BLEND_MODES[layer.blendMode] ?? 'source-over';

    if (placeholder && placeholder.role === 'text' && layer.kind === 'text') {
      const substituted = resolver(placeholder.key);
      // Unmapped/empty → keep the original sample text (design as authored).
      const content = substituted.length > 0 ? substituted : (layer.text?.content ?? '');
      drawTextLayer(context, layer, content, scale);
    } else if (placeholder && placeholder.role === 'photo') {
      const photo = options.getPhoto?.(options.row?.rowIndex ?? -1);
      const rasterUrl = design.layerRasters[layer.id];
      if (photo) {
        await drawPhotoLayer(context, layer, photo, scale);
      } else if (rasterUrl) {
        await drawRasterLayer(context, layer, rasterUrl, scale);
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
