/**
 * v0.6.4 regression tests — placeholder text is never clipped or trimmed.
 *
 * The v0.6.3 renderer drew substituted text on an offscreen canvas sized to
 * the ORIGINAL sample string's ink bounds ("ID" ≈ 44 px wide) and wrapped at
 * that width: longer values were clipped mid-glyph ("Engineeri") and wrapped
 * lines fell outside the one-line-tall canvas ("Alice Johnson" → "Alice").
 * These tests pin the fixed contract: the layer canvas GROWS to fit the
 * measured content (capped only by the card), box text wraps at the parsed
 * text-box width, point text never width-wraps, and geometry comes from the
 * engine origin / oracle baseline — never the sample's shrink-wrapped ink.
 *
 * jsdom's stock canvas mock never paints, so this file installs a tiny
 * observable rasteriser (fillRect/fillText paint real pixels into a buffer)
 * for the duration of the suite — that makes ink-extent assertions real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compositeDesign } from '@/services/psdCompositeService';
import type { PsdDesign, PsdLayerInfo, PsdPlaceholder } from '@/types/psd';

/* ------------------------------------------------------------------ */
/* Observable canvas mock                                              */
/* ------------------------------------------------------------------ */

interface FillRecord {
  kind: 'rect' | 'text' | 'image' | 'clear';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
  /** For image records: the source canvas (replayed recursively) */
  source?: HTMLCanvasElement;
  /** Composite operation captured at call time */
  composite: GlobalCompositeOperation;
  text?: string;
}

/** Parse the colour forms the renderer emits: #rgb(a), #rrggbb(aa), rgba() */
function parseColor(value: string): [number, number, number, number] {
  const clean = value.trim();
  if (clean === 'transparent') return [0, 0, 0, 0];
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(clean);
  if (rgba) {
    const parts = rgba[1]!.split(',').map((part) => parseFloat(part.trim()));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  let hex = clean.replace('#', '');
  if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if (![r, g, b, a].some(Number.isNaN)) return [r, g, b, a];
  }
  return [0, 0, 0, 1];
}

class Mock2DContext {
  canvas: HTMLCanvasElement;
  fillStyle = '#000000';
  strokeStyle = '#000000';
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  font = '10px sans-serif';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineJoin: CanvasLineJoin = 'miter';
  lineWidth = 1;
  shadowColor = 'transparent';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  private fills: FillRecord[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  setTransform(): void {}
  setLineDash(): void {}
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop: (): void => {} };
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop: (): void => {} };
  }
  createPattern(): null {
    return null;
  }

  measureText(text: string): TextMetrics {
    // Deterministic mock metrics: 6 px per character.
    return { width: text.length * 6 } as unknown as TextMetrics;
  }

  private fontSizeOf(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return match ? parseFloat(match[1]!) : 10;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({
      kind: 'rect',
      x,
      y,
      w,
      h,
      color: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({
      kind: 'rect',
      x,
      y,
      w,
      h,
      color: this.strokeStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  fillText(text: string, x: number, y: number): void {
    const size = this.fontSizeOf();
    this.fills.push({
      kind: 'text',
      x,
      y: y - size * 0.8, // ink box: ascent 0.8 em above the baseline
      w: text.length * 6,
      h: size,
      color: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      text,
    });
  }

  strokeText(text: string, x: number, y: number): void {
    const size = this.fontSizeOf();
    this.fills.push({
      kind: 'text',
      x,
      y: y - size * 0.8,
      w: text.length * 6,
      h: size,
      color: this.strokeStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      text,
    });
  }

  drawImage(image: CanvasImageSource, dx: number, dy: number, dw?: number, dh?: number): void {
    const source = image as { width?: number; height?: number };
    this.fills.push({
      kind: 'image',
      x: dx,
      y: dy,
      w: dw ?? source.width ?? 0,
      h: dh ?? source.height ?? 0,
      color: '#ffffff',
      alpha: this.globalAlpha,
      source: image instanceof HTMLCanvasElement ? image : undefined,
      composite: this.globalCompositeOperation,
    });
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({
      kind: 'clear',
      x,
      y,
      w,
      h,
      color: 'transparent',
      alpha: 1,
      composite: 'source-over',
    });
  }

  getImageData(sx: number, sy: number, w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const paint = (record: FillRecord): void => {
      const left = Math.max(0, Math.floor(record.x - sx));
      const top = Math.max(0, Math.floor(record.y - sy));
      const right = Math.min(w, Math.ceil(record.x - sx + record.w));
      const bottom = Math.min(h, Math.ceil(record.y - sy + record.h));
      if (record.kind === 'image') {
        if (record.composite === 'destination-in') {
          // Mask semantics: keep existing pixels INSIDE the rect, erase outside.
          for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
              const inside =
                x >= left && x < right && y >= top && y < bottom;
              if (!inside) data[(y * w + x) * 4 + 3] = 0;
            }
          }
          return;
        }
        // Source-over: replay the source canvas's own fill history,
        // translated by the draw position (offscreen layer compositing).
        const sourceContext = record.source
          ? contextCache.get(record.source)
          : undefined;
        if (sourceContext) {
          for (const sourceFill of sourceContext.fills) {
            paint({
              ...sourceFill,
              x: sourceFill.x + record.x,
              y: sourceFill.y + record.y,
              alpha: sourceFill.alpha * record.alpha,
            });
          }
        }
        return;
      }
      const [cr, cg, cb, ca] = parseColor(record.color);
      const alpha = ca * record.alpha;
      for (let y = top; y < bottom && y < canvasHeight; y += 1) {
        for (let x = left; x < right && x < canvasWidth; x += 1) {
          const index = (y * w + x) * 4;
          if (record.kind === 'clear') {
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 0;
            continue;
          }
          // Source-over compositing.
          const destinationAlpha = data[index + 3]! / 255;
          const outAlpha = alpha + destinationAlpha * (1 - alpha);
          if (outAlpha <= 0) continue;
          data[index] = Math.round((cr * alpha + data[index]! * destinationAlpha * (1 - alpha)) / outAlpha);
          data[index + 1] = Math.round((cg * alpha + data[index + 1]! * destinationAlpha * (1 - alpha)) / outAlpha);
          data[index + 2] = Math.round((cb * alpha + data[index + 2]! * destinationAlpha * (1 - alpha)) / outAlpha);
          data[index + 3] = Math.round(outAlpha * 255);
        }
      }
    };
    for (const record of this.fills) paint(record);
    return { data, width: w, height: h } as unknown as ImageData;
  }
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const contextCache = new WeakMap<HTMLCanvasElement, Mock2DContext>();
beforeAll(() => {
  // Browsers return THE SAME context object for repeated getContext calls —
  // the mock must do the same or the fill history (and thus getImageData)
  // resets between the renderer's calls and the test's reads.
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let context = contextCache.get(this);
    if (!context) {
      context = new Mock2DContext(this);
      contextCache.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/* ------------------------------------------------------------------ */
/* Fixture helpers                                                     */
/* ------------------------------------------------------------------ */

/** A single-layer design containing one text layer (no oracle by default) */
function designWithTextLayer(
  text: Partial<NonNullable<PsdLayerInfo['text']>> & { content: string },
  layerOverrides: Partial<PsdLayerInfo> = {},
  canvasSize = { width: 638, height: 1011 }
): PsdDesign {
  const layer: PsdLayerInfo = {
    id: 'front/Name',
    name: 'Name',
    path: ['Name'],
    kind: 'text',
    hidden: false,
    bounds: { left: 270, top: 683, right: 314, bottom: 719 }, // "ID" ink bounds
    opacity: 1,
    blendMode: 'normal',
    hasPixels: false,
    hasEffects: false,
    clipped: false,
    childCount: 0,
    text: {
      fontSize: 50,
      fontFamily: 'ArialMT',
      color: '#e91e63',
      justification: 'left',
      ...text,
    },
    ...layerOverrides,
  };
  return {
    fileName: 'test.psd',
    width: canvasSize.width,
    height: canvasSize.height,
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

const options = (row: Record<string, string>) => ({
  placeholders: [placeholder],
  mappings: { Name: 'Name' },
  row: { rowIndex: 0, values: row },
  backgroundColor: '#ffffff',
});

interface InkBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  count: number;
}

/** Bounding box of non-white pixels on the composited card */
async function inkBoxOf(
  design: PsdDesign,
  row: Record<string, string>
): Promise<InkBox> {
  const canvas = await compositeDesign(design, options(row));
  const context = canvas.getContext('2d') as unknown as Mock2DContext;
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height) as unknown as {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isWhite =
        data[index] === 255 && data[index + 1] === 255 && data[index + 2] === 255;
      if (isWhite) continue;
      count += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { left, top, right, bottom, count };
}

describe('placeholder text is never clipped (v0.6.4)', () => {
  it('a long single word renders FULLY — no mid-glyph trim like "Engineeri"', async () => {
    const design = designWithTextLayer({ content: 'ID' });
    const box = await inkBoxOf(design, { Name: 'Engineering' });
    // Mock metrics: 11 chars × 6 px = 66 px of ink starting at origin 270.
    // The old 44 px sample canvas clipped it to ~48 px of visible ink.
    expect(box.count).toBeGreaterThan(0);
    expect(box.right - box.left).toBeGreaterThanOrEqual(64);
    expect(box.left).toBe(270);
    expect(box.right).toBeLessThanOrEqual(638);
  });

  it('a value wider than the sample box overflows the box, never clips', async () => {
    const design = designWithTextLayer({ content: 'ID' });
    const box = await inkBoxOf(design, { Name: '1001 Engineering Way' });
    // 20 chars × 6 px = 120 px wide — far beyond the old 48 px canvas.
    expect(box.right - box.left).toBeGreaterThanOrEqual(118);
  });

  it('box text wraps at the parsed boxWidth, not the sample ink bounds', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 204,
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // 13 chars × 6 px = 78 px ≤ 204 px box → ONE line, fully drawn.
    expect(box.count).toBeGreaterThan(0);
    expect(box.right - box.left).toBeGreaterThanOrEqual(76);
  });

  it('a forced wrap draws BOTH lines inside the canvas (leading = 1.2×size)', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60, // "Alice Johnson" → "Alice" / "Johnson" under mock metrics
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // No oracle → baseline 1 = originY + 0.8×50 = 551.47, baseline 2 = 611.47.
    // Both ink bands must be present; the old 2583 px leading pushed line 2
    // to ~3100 (outside the card entirely).
    expect(box.count).toBeGreaterThan(0);
    expect(box.top).toBeLessThan(560);
    expect(box.bottom).toBeGreaterThan(575);
    expect(box.bottom).toBeLessThan(660);
  });

  it('point text never width-wraps (explicit newlines only)', async () => {
    const design = designWithTextLayer({ content: 'ID' });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // One band only: ink height ≈ one 50 px line (mock paints size-tall boxes).
    expect(box.bottom - box.top).toBeLessThanOrEqual(55);
  });

  it('centre-justified point text paints around its origin without crashing', async () => {
    const design = designWithTextLayer({
      content: 'Demo University',
      justification: 'center',
      fontSize: 66.67,
      originX: 69,
      originY: 56.47,
    });
    const box = await inkBoxOf(design, { Name: 'Massachusetts Institute of Technology' });
    expect(box.count).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(638);
  });

  it('the oracle baselineOffset anchors the first baseline exactly', async () => {
    // Oracle as the parse step stores it for the "ID" sample: ink top y=683,
    // ink-top→baseline offset 36 px (cap height of 50 px Arial), origin→ink 4.
    const design = designWithTextLayer(
      {
        content: 'ID',
        oracle: {
          fontSize: 50,
          bold: true,
          italic: false,
          color: '#1e1e1e',
          inkBox: { left: 270, top: 683, right: 314, bottom: 719 },
          baselineOffset: 36,
          originOffsetX: 4,
        },
      },
      { bounds: { left: 270, top: 683, right: 314, bottom: 719 } }
    );
    const box = await inkBoxOf(design, { Name: 'Alice' });
    // Baseline = 683 + 36 = 719; mock ascent 0.8×50 = 40 → ink top = 679.
    // (The pre-fix vertical-centring path put it at 683+; ±3 tolerance keeps
    // this a sharp discriminator.)
    expect(box.top).toBeGreaterThanOrEqual(676);
    expect(box.top).toBeLessThanOrEqual(682);
    // Left: origin 270 + measured originOffsetX 4 = 274.
    expect(box.left).toBe(274);
  });
});
