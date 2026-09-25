import type { CardTemplate, CanvasElement, TemplateSide } from '@/types/template';
import { sideKey } from '@/types/template';
import type { DataRow, PhotoRecord } from '@/types/data';
import { mmToPx } from '@/utils/units';

/** A resolved value lookup: placeholder → string for the current row */
export type ValueResolver = (placeholder: string) => string;

/**
 * Build a value resolver for one data row using column mappings.
 * Falls back to the placeholder's default or `{{Placeholder}}` itself.
 *
 * @param mappings - placeholder → column mapping
 * @param row - Current data row (null shows template defaults)
 * @returns Resolver function
 */
export function createValueResolver(
  mappings: Record<string, string>,
  row: DataRow | null
): ValueResolver {
  return (placeholder: string): string => {
    const column = mappings[placeholder];
    if (row && column) {
      const value = row.values[column];
      if (value !== undefined && value.length > 0) return value;
    }
    return `{{${placeholder}}}`;
  };
}

/** Photo lookup for the current row: rowIndex → photo */
export type PhotoResolver = (rowIndex: number) => PhotoRecord | undefined;

/**
 * Substitute `{{Placeholder}}` tokens inside a text string.
 * @param text - Text possibly containing placeholders
 * @param resolve - Value resolver
 * @returns Text with all tokens replaced
 */
export function substituteText(text: string, resolve: ValueResolver): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, rawName: string) => {
    const name = rawName.trim();
    return name.length > 0 ? resolve(name) : match;
  });
}

/** Options for drawing a preview */
export interface DrawPreviewOptions {
  /** Canvas scale multiplier (1 = 96-DPI screen scale) */
  scale?: number;
  /** Photo lookup for image/placeholder substitution */
  getPhoto?: PhotoResolver;
}

/** Simple LRU-ish image cache for blob URLs used in previews */
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Load and cache an image from a URL (blob or data URL).
 * @param src - Image source URL
 * @returns Decoded image element
 */
async function loadImageCached(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Image failed to load: ${src.slice(0, 64)}…`));
    element.src = src;
  });
  // Bound the cache to keep memory in check.
  if (imageCache.size > 50) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey !== undefined) imageCache.delete(oldestKey);
  }
  imageCache.set(src, image);
  return image;
}

/** Clear the preview image cache (call when photos change). */
export function clearPreviewImageCache(): void {
  imageCache.clear();
}

/** Apply common element properties to a 2D context */
function applyStyle(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  resolve: ValueResolver
): void {
  context.globalAlpha = element.opacity;
  if (element.shadow?.enabled) {
    context.shadowColor = element.shadow.color;
    context.shadowBlur = element.shadow.blur;
    context.shadowOffsetX = element.shadow.offsetX;
    context.shadowOffsetY = element.shadow.offsetY;
  } else {
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
  }
  if (element.stroke && element.strokeWidth && element.strokeWidth > 0) {
    context.strokeStyle = element.stroke;
    context.lineWidth = element.strokeWidth;
    if (element.strokeDashArray && element.strokeDashArray.length > 0) {
      context.setLineDash(element.strokeDashArray);
    }
  } else {
    context.setLineDash([]);
    context.strokeStyle = 'transparent';
    context.lineWidth = 0;
  }
  void resolve; // style hook kept for future data-driven strokes
}

/** Draw a filled + stroked rounded rect path */
function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

/** Draw an image element (with centre-crop) at its position */
async function drawImageElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  photo: PhotoRecord | undefined,
  scale: number
): Promise<void> {
  if (!photo) {
    // Placeholder box for missing photo.
    context.save();
    context.strokeStyle = '#94A3B8';
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(
      element.x * scale,
      element.y * scale,
      element.width * scale,
      element.height * scale
    );
    context.restore();
    return;
  }
  const image = await loadImageCached(photo.blobUrl);
  const dx = element.x * scale;
  const dy = element.y * scale;
  const dw = element.width * scale;
  const dh = element.height * scale;

  // Centre-crop source to element aspect ratio.
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

/** Draw a text or placeholder element with data substituted */
function drawTextElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  resolve: ValueResolver,
  scale: number
): void {
  const rawText =
    element.type === 'placeholder' && element.columnName
      ? `{{${element.columnName}}}`
      : (element.text ?? '');
  const value = substituteText(rawText, resolve);

  context.save();
  context.fillStyle = element.fill?.color ?? '#111111';
  context.textBaseline = 'top';
  context.font = [
    element.fontStyle === 'italic' ? 'italic' : '',
    element.fontWeight === 'bold' ? 'bold' : '',
    `${element.fontSize ?? 12}pt`,
    element.fontFamily ?? 'Inter',
  ]
    .filter(Boolean)
    .join(' ');

  const fontSizePx = ((element.fontSize ?? 12) * 4) / 3; // pt → px
  const lineHeight = (element.lineHeight ?? 1.16) * fontSizePx;

  // Simple word-wrap to element width.
  const maxWidth = element.width * scale;
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine.length > 0 ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  if (lines.length === 0) lines.push(value);

  const align = element.textAlign ?? 'left';
  const boxWidth = maxWidth;
  const startY = element.y * scale + (lineHeight - fontSizePx) / 2;

  context.translate(element.x * scale, 0);
  lines.forEach((line, index) => {
    const lineWidth = context.measureText(line).width;
    let offsetX = 0;
    if (align === 'center') offsetX = (boxWidth - lineWidth) / 2;
    else if (align === 'right') offsetX = boxWidth - lineWidth;
    context.fillText(line, offsetX, startY + index * lineHeight);
  });
  context.restore();
}

/** Draw a shape element (rect / circle / line) */
function drawShapeElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  scale: number
): void {
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;

  const fillStyle = element.fill?.type === 'none' ? undefined : element.fill?.color;

  if (
    element.shapeKind === 'circle' ||
    (element.type === 'shape' && !element.shapeKind && width === height)
  ) {
    context.beginPath();
    context.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    if (fillStyle) {
      context.fillStyle = fillStyle;
      context.fill();
    }
    context.stroke();
    return;
  }

  if (element.shapeKind === 'line') {
    context.beginPath();
    context.moveTo(x, y + height / 2);
    context.lineTo(x + width, y + height / 2);
    context.stroke();
    return;
  }

  // rect / polygon (polygon approximated as rect)
  if (element.cornerRadius && element.cornerRadius > 0) {
    roundedRectPath(context, x, y, width, height, element.cornerRadius * scale);
  } else {
    context.beginPath();
    context.rect(x, y, width, height);
  }
  if (fillStyle) {
    context.fillStyle = fillStyle;
    context.fill();
  }
  context.stroke();
}

/** Draw a barcode placeholder box (real barcode rendering arrives in Phase 4+). */
function drawBarcodeElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  resolve: ValueResolver,
  scale: number
): void {
  const data = element.barcodeData
    ? substituteText(element.barcodeData, resolve)
    : (element.barcodeType?.toUpperCase() ?? 'BARCODE');
  context.save();
  context.fillStyle = '#FFFFFF';
  context.fillRect(
    element.x * scale,
    element.y * scale,
    element.width * scale,
    element.height * scale
  );
  context.strokeStyle = '#333333';
  context.lineWidth = 1;
  context.strokeRect(
    element.x * scale,
    element.y * scale,
    element.width * scale,
    element.height * scale
  );
  context.fillStyle = '#333333';
  context.font = '8px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = data.length > 18 ? `${data.slice(0, 15)}…` : data;
  context.fillText(
    label,
    element.x * scale + (element.width * scale) / 2,
    element.y * scale + (element.height * scale) / 2
  );
  context.restore();
}

/**
 * Draw one template side with data applied onto a 2D canvas context.
 * Photo placeholders are elements of type 'image' whose `columnName` is set,
 * or 'placeholder' elements named like a photo column.
 *
 * @param context - Target 2D context
 * @param side - Template side to render
 * @param resolve - Value resolver for the current row
 * @param getPhoto - Photo lookup by rowIndex
 * @param scale - Pixel scale (mm → px multiplier)
 */
export async function drawSide(
  context: CanvasRenderingContext2D,
  side: TemplateSide,
  resolve: ValueResolver,
  getPhoto: PhotoResolver | undefined,
  scale: number
): Promise<void> {
  context.save();
  context.fillStyle = side.backgroundColor;
  context.fillRect(0, 0, side.canvasWidth * scale, side.canvasHeight * scale);
  context.restore();

  const elements = [...side.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const element of elements) {
    if (!element.visible) continue;
    context.save();
    applyStyle(context, element, resolve);
    context.translate(element.x * scale, element.y * scale);
    context.rotate((element.rotation * Math.PI) / 180);
    context.translate(-element.x * scale, -element.y * scale);

    if (element.type === 'image' || (element.type === 'placeholder' && getPhoto)) {
      const photo = getPhoto?.(0) ?? undefined;
      if (element.type === 'image') {
        await drawImageElement(context, element, photo, scale);
      } else if (element.imageSrc) {
        await drawImageElement(context, element, photo, scale);
      } else {
        drawTextElement(context, element, resolve, scale);
      }
    } else if (element.type === 'text' || element.type === 'placeholder') {
      drawTextElement(context, element, resolve, scale);
    } else if (element.type === 'barcode') {
      drawBarcodeElement(context, element, resolve, scale);
    } else {
      drawShapeElement(context, element, scale);
    }
    context.restore();
  }
}

/** A rendered preview of one side */
export interface SidePreview {
  canvas: HTMLCanvasElement;
  side: TemplateSide;
}

/**
 * Render one side of a template with a data row applied to a new canvas.
 *
 * @param template - The card template
 * @param sideType - Which side to render
 * @param row - Data row to apply (null = raw template)
 * @param mappings - Placeholder → column mapping
 * @param options - Draw options (scale, photo lookup)
 * @returns Rendered canvas for display or export
 */
export async function renderSidePreview(
  template: CardTemplate,
  sideType: 'front' | 'back',
  row: DataRow | null,
  mappings: Record<string, string>,
  options: DrawPreviewOptions = {}
): Promise<HTMLCanvasElement> {
  const side = template[sideKey(sideType)];
  const scale = options.scale ?? mmToPx(1);
  const resolve = createValueResolver(mappings, row);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(side.canvasWidth * scale));
  canvas.height = Math.max(1, Math.round(side.canvasHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable.');
  }

  await drawSide(context, side, resolve, options.getPhoto, scale);
  return canvas;
}

/**
 * Render both sides of a template with a data row applied.
 * @param template - The card template
 * @param row - Data row (null = raw template)
 * @param mappings - Placeholder → column mapping
 * @param options - Draw options
 * @returns Front and back canvases
 */
export async function renderCardPreview(
  template: CardTemplate,
  row: DataRow | null,
  mappings: Record<string, string>,
  options: DrawPreviewOptions = {}
): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> {
  const front = await renderSidePreview(template, 'front', row, mappings, options);
  const back = await renderSidePreview(template, 'back', row, mappings, options);
  return { front, back };
}
