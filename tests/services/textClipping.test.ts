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
  kind: 'rect' | 'text' | 'image' | 'clear' | 'put';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
  /** For image records: the source canvas (replayed recursively) */
  source?: HTMLCanvasElement;
  /** Source-crop rect for the 9-arg drawImage form (sx, sy, sw, sh) */
  crop?: { x: number; y: number; w: number; h: number };
  /** For put records: raw RGBA bytes written (putImageData ignores blending) */
  px?: Uint8ClampedArray;
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
  /** Paint history, replayed by getImageData — public for test inspection */
  fills: FillRecord[] = [];
  /** Affine x-transform state (x' = a·x + e) so v0.6.5 squish is observable */
  private transformA = 1;
  private transformE = 0;
  private transformStack: Array<{ a: number; e: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  save(): void {
    this.transformStack.push({ a: this.transformA, e: this.transformE });
  }
  restore(): void {
    const snapshot = this.transformStack.pop();
    if (snapshot) {
      this.transformA = snapshot.a;
      this.transformE = snapshot.e;
    }
  }
  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  translate(x: number, y: number): void {
    // Compose: x' = a·(x + tx) + e
    this.transformE += this.transformA * x;
    void y; // the renderer only squishes the x axis
  }
  rotate(): void {}
  scale(x: number, y: number): void {
    this.transformA *= x;
    void y;
  }
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
      x: this.transformA * x + this.transformE,
      y,
      w: w * this.transformA,
      h,
      color: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({
      kind: 'rect',
      x: this.transformA * x + this.transformE,
      y,
      w: w * this.transformA,
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
      x: this.transformA * x + this.transformE,
      y: y - size * 0.8, // ink box: ascent 0.8 em above the baseline
      w: text.length * 6 * this.transformA,
      h: size, // VERTICAL size is never scaled by the auto-fit squish
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
      x: this.transformA * x + this.transformE,
      y: y - size * 0.8,
      w: text.length * 6 * this.transformA,
      h: size,
      color: this.strokeStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      text,
    });
  }

  drawImage(
    image: CanvasImageSource,
    a1: number,
    a2: number,
    a3?: number,
    a4?: number,
    a5?: number,
    a6?: number,
    a7?: number,
    a8?: number
  ): void {
    const source = image as { width?: number; height?: number };
    // 5-arg form: (dx, dy, dw, dh) — full source scaled into the rect.
    // 9-arg form: (sx, sy, sw, sh, dx, dy, dw, dh) — source crop scaled in.
    const isCrop = arguments.length >= 9;
    this.fills.push({
      kind: 'image',
      x: isCrop ? a5! : a1,
      y: isCrop ? a6! : a2,
      w: isCrop ? a7! : (a3 ?? source.width ?? 0),
      h: isCrop ? a8! : (a4 ?? source.height ?? 0),
      crop: isCrop ? { x: a1, y: a2, w: a3 ?? 0, h: a4 ?? 0 } : undefined,
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

  putImageData(image: ImageData, dx: number, dy: number): void {
    // Raw pixel write: bypasses compositing, exactly like the real API.
    this.fills.push({
      kind: 'put',
      x: dx,
      y: dy,
      w: image.width,
      h: image.height,
      color: 'transparent',
      alpha: 1,
      px: new Uint8ClampedArray(image.data),
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
          // REAL destination-in semantics: result = destination × source
          // alpha. With a source canvas, rasterise the source's own fill
          // history (via its context) and multiply per pixel — a mask plane
          // whose content varies (white/black mask bitmaps) must clip
          // per-pixel, not per-rect. Without a source, fall back to the
          // rect keep-window (the photo stroke paths).
          if (record.source) {
            const sourceContext = contextCache.get(record.source);
            if (sourceContext) {
              const sourceImage = sourceContext.getImageData(
                0,
                0,
                record.source.width,
                record.source.height
              ) as unknown as { data: Uint8ClampedArray; width: number; height: number };
              for (let y = 0; y < h; y += 1) {
                for (let x = 0; x < w; x += 1) {
                  const globalX = sx + x;
                  const globalY = sy + y;
                  const sourceX = Math.floor(globalX - record.x);
                  const sourceY = Math.floor(globalY - record.y);
                  const destinationIndex = (y * w + x) * 4;
                  if (
                    sourceX < 0 ||
                    sourceY < 0 ||
                    sourceX >= sourceImage.width ||
                    sourceY >= sourceImage.height
                  ) {
                    data[destinationIndex + 3] = 0;
                    continue;
                  }
                  const sourceAlpha =
                    sourceImage.data[(sourceY * sourceImage.width + sourceX) * 4 + 3] ?? 0;
                  data[destinationIndex + 3] = Math.floor(
                    (data[destinationIndex + 3] ?? 0) * (sourceAlpha / 255)
                  );
                }
              }
            }
            return;
          }
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
        // With a source CROP, replay only fills inside the crop window
        // (offset by −crop origin) — pixels outside it read transparent.
        const sourceContext = record.source
          ? contextCache.get(record.source)
          : undefined;
        if (sourceContext) {
          for (const sourceFill of sourceContext.fills) {
            if (record.crop) {
              const sLeft = sourceFill.x;
              const sTop = sourceFill.y;
              const sRight = sLeft + sourceFill.w;
              const sBottom = sTop + sourceFill.h;
              const left2 = Math.max(sLeft, record.crop.x);
              const top2 = Math.max(sTop, record.crop.y);
              const right2 = Math.min(sRight, record.crop.x + record.crop.w);
              const bottom2 = Math.min(sBottom, record.crop.y + record.crop.h);
              if (right2 <= left2 || bottom2 <= top2) continue;
              paint({
                ...sourceFill,
                x: left2 - record.crop.x + record.x,
                y: top2 - record.crop.y + record.y,
                w: right2 - left2,
                h: bottom2 - top2,
                alpha: sourceFill.alpha * record.alpha,
              });
              continue;
            }
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
          if (record.kind === 'put' && record.px) {
            // Raw copy from the source image at the recorded origin.
            const sourceX = Math.floor(record.x - sx) + (x - left);
            const sourceY = Math.floor(record.y - sy) + (y - top);
            const source = (sourceY * record.w + sourceX) * 4;
            data[index] = record.px[source] ?? 0;
            data[index + 1] = record.px[source + 1] ?? 0;
            data[index + 2] = record.px[source + 2] ?? 0;
            data[index + 3] = record.px[source + 3] ?? 0;
            continue;
          }
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

/**
 * Collect every TEXT fill recorded across the compositing graph: the card
 * canvas plus (recursively) every offscreen layer canvas it drawImage's —
 * text is painted on the offscreen canvas, not the card itself.
 */
function collectTextFills(canvas: HTMLCanvasElement): FillRecord[] {
  const found: FillRecord[] = [];
  const visited = new Set<HTMLCanvasElement>();
  const walk = (target: HTMLCanvasElement): void => {
    if (visited.has(target)) return;
    visited.add(target);
    const context = contextCache.get(target);
    if (!context) return;
    for (const fill of context.fills) {
      if (fill.kind === 'text') found.push(fill);
      if (fill.kind === 'image' && fill.source) walk(fill.source);
    }
  };
  walk(canvas);
  return found;
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

  it('a single-line placeholder never wraps — hybrid fitting compresses it to one line', async () => {
    // THE "Charmaine Patel" BUG: the value exceeded its box, wrapped onto a
    // second line and bled down over the layer beneath. the calculated single-line capacity forces
    // single-line layout for substituted values and compresses horizontally
    // instead — the box width (60 px) is the compression zone.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // ONE line: natural 13×6 = 78 px compressed to the 60 px box; no-oracle
    // baseline = originY + 0.8×50 = 551.47 → ink band 511–562. The old wrap
    // put a second band at 562–622 (bleeding over the layer below).
    expect(box.count).toBeGreaterThan(0);
    expect(box.top).toBeGreaterThanOrEqual(505);
    expect(box.bottom).toBeLessThanOrEqual(565); // NO second line below
    // Compressed width ≈ the box width, never the natural 78 px.
    expect(box.right - box.left).toBeGreaterThanOrEqual(55);
    expect(box.right - box.left).toBeLessThanOrEqual(63);
    // Left-anchored: compression never shifts the start position.
    expect(box.left).toBeLessThanOrEqual(268);
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

  it('a substituted value paints in ONE style — never half upright, half italic', async () => {
    // The sample PSD's value layers carry positional engine runs over the
    // SAMPLE ("Name" → chars 0–3). Before the fix those runs split the
    // substituted string at a sample boundary: "Bob" upright + " Smith"
    // italic. A substituted value must take the single oracle style.
    const design = designWithTextLayer(
      {
        content: 'Name',
        runs: [
          { from: 0, to: 4, italic: false, color: '#1e1e1e' }, // sample-only run
          { from: 4, to: 8, italic: true, color: '#ff00ff' }, // boundary beyond sample
        ],
        oracle: {
          fontSize: 50,
          bold: true,
          italic: true,
          color: '#e91e63',
          inkBox: { left: 270, top: 683, right: 398, bottom: 719 },
          baselineOffset: 36,
          originOffsetX: 4,
        },
      },
      { bounds: { left: 270, top: 683, right: 398, bottom: 719 } }
    );
    const canvas = await compositeDesign(design, options({ Name: 'Bob Smith' }));
    const textFills = collectTextFills(canvas);
    expect(textFills.length).toBeGreaterThan(0);
    // Every text fill must use the oracle colour — a run-split would paint
    // part of the string with the sample run's colour instead.
    for (const fill of textFills) {
      expect(fill.color.toLowerCase()).toBe('#e91e63');
    }
  });

  it('the ORIGINAL sample text still honours its positional runs', async () => {
    // Substitution semantics must not erase real per-run styling: drawing
    // the design as authored (empty substitution → sample content) paints
    // each run segment in its own colour.
    const design = designWithTextLayer({
      content: 'AB',
      runs: [
        { from: 0, to: 1, color: '#ff0000' },
        { from: 1, to: 2, color: '#0000ff' },
      ],
    });
    const canvas = await compositeDesign(design, options({ Name: '' }));
    const textFills = collectTextFills(canvas);
    expect(textFills.length).toBeGreaterThanOrEqual(2);
    const colours = new Set(textFills.map((fill) => fill.color.toLowerCase()));
    expect(colours.has('#ff0000')).toBe(true);
    expect(colours.has('#0000ff')).toBe(true);
  });
});

describe('hybrid text fitting + horizontal compression (v0.6.8)', () => {
  it('"Charmaine Patel" (14×6 = 84 px) compresses to the 60 px zone on ONE line', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Charmaine Patel' });
    // No second baseline band (the old wrap put one at ~562–622).
    expect(box.top).toBeGreaterThanOrEqual(505);
    expect(box.bottom).toBeLessThanOrEqual(565);
    // Squished to the zone, left edge unmoved.
    expect(box.right - box.left).toBeGreaterThanOrEqual(55);
    expect(box.right - box.left).toBeLessThanOrEqual(63);
    expect(box.left).toBeLessThanOrEqual(268);
    // Vertical glyph size is PRESERVED: 50 px font → 40 px ink (0.8 em).
    expect(box.bottom - box.top).toBeGreaterThanOrEqual(39);
  });

  it('a multi-line placeholder wraps naturally when height allows two lines, without compression when both lines fit', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 72,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // 72 px box / 60 px leading => capacity 2. The payload wraps at the
    // authored width, so both words occupy separate lines. Neither natural
    // line is wider than 72 px (5×6 and 7×6 in the observable rasteriser),
    // therefore Horizontal Scale stays at 100 %.
    expect(box.bottom - box.top).toBeGreaterThan(90);
    expect(box.right - box.left).toBeLessThanOrEqual(72);
  });

  it('a multi-line placeholder compresses WITHIN its authored two-line budget (the Charmaine scenario)', async () => {
    // v0.6.12 CONTRACT: the authored box height is the line budget — a
    // two-line box holds the value on two lines, never three — AND wrap
    // converges with compression: once the needed ratio is known, the text
    // re-wraps at the compressed effective width so earlier lines absorb
    // the words compression made room for ("Near" pulled up onto line 1).
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson Engineering Department' });
    // Exactly TWO lines (ink height ≈ 2 × 60 leading − gap), NOT four:
    expect(box.bottom - box.top).toBeLessThanOrEqual(115);
    // Converged layout: "Alice Johnson" (78 px natural) pulled onto line 1,
    // "Engineering Department" (132 px) on line 2 at the 0.65 floor →
    // widest painted ≈ 132 × 0.65 ≈ 86 px — wider than the 60 px box
    // (floor protrusion) but far from the 180 px un-converged pile-up.
    expect(box.right - box.left).toBeGreaterThanOrEqual(80);
    expect(box.right - box.left).toBeLessThanOrEqual(95);
  });

  it('a breakable address wraps to exactly its authored capacity with mild floor-safe compression', async () => {
    // The Charmaine Patel card: 120-px-wide, 2-line box, 43-char address.
    // Line 1 wraps naturally ("12, MG Road, Near" = 102 px ≤ 120), the
    // remainder sits on the authored second line and compresses ~0.8 —
    // NO third line below the box.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 120,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: '12, MG Road, Near Trinity Circle, Bengaluru' });
    expect(box.bottom - box.top).toBeLessThanOrEqual(115); // two lines only
    expect(box.right - box.left).toBeGreaterThanOrEqual(95);
    expect(box.right - box.left).toBeLessThanOrEqual(122); // ≈ the box width
  });

  it('an address-style value wraps naturally at 100 % scale with zero compression', async () => {
    // The screenshot scenario: a breakable address that fits its box once it
    // is allowed to wrap — wrap-first must leave Horizontal Scale at 100 %.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 120,
      boxHeight: 180,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: '12, MG Road, Near Trinity Circle, Bengaluru' });
    // Three natural lines (capacity 3): widest "12, MG Road, Near" = 102 px
    // ≤ 120 px box → NO compression. Old behaviour crushed the whole value
    // onto one 120-px line at ~0.45 scale.
    expect(box.bottom - box.top).toBeGreaterThanOrEqual(165);
    expect(box.right - box.left).toBeGreaterThanOrEqual(95);
    expect(box.right - box.left).toBeLessThanOrEqual(122);
  });

  it('a multi-line placeholder NEVER compresses below the 0.65 readability floor', async () => {
    // Two-line box, 60 unbreakable chars: line 1 takes 10 x's (60 px), the
    // remaining 50 pile onto the authored second line (300 px natural). The
    // floor clamps the paint at 0.65 × 300 = 195 px, NOT 0.05-crushed.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'x'.repeat(60) });
    // Exactly the authored two lines (clamped at the card's visible area):
    expect(box.bottom - box.top).toBeLessThanOrEqual(115);
    expect(box.right - box.left).toBeGreaterThanOrEqual(190); // ≥ 0.65 × 300 − tolerance
  });

  it('the authored capacity caps wrapping even when the card has free space below', async () => {
    // The v0.6.9 granting behaviour is REVERSED: a two-line box stays two
    // lines even with the whole card bottom free — overflow compresses.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Internationalization' });
    // Two lines only; the "Internationalization" token (120 px natural)
    // is floor-compressed to 0.65 × 120 = 78 px.
    expect(box.bottom - box.top).toBeLessThanOrEqual(115);
    expect(box.right - box.left).toBeGreaterThanOrEqual(75);
    expect(box.right - box.left).toBeLessThanOrEqual(82);
  });

  it('a multi-line field uses its authored lines before granting extras', async () => {
    // "Alice Johnson" in the 72-px box (capacity 2): wrapping uses the
    // authored capacity; the 72-px line needs no compression, so NO extra
    // line is granted and no line exceeds the box width.
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 72,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    expect(box.bottom - box.top).toBeGreaterThan(90); // still exactly 2 lines
    expect(box.right - box.left).toBeLessThanOrEqual(72);
  });

  it('a fitting value keeps 100 % horizontal scale — pixel-identical to v0.6.4', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 204,
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice' });
    // 5×6 = 30 px of ink (columns 266–295 → 29 px measured) ≤ 204 px box:
    // no compression — natural width, full height.
    expect(box.right - box.left).toBe(29);
    expect(box.bottom - box.top).toBe(50); // one 50 px line (0.8 em + 0.2 em mock box)
    expect(box.left).toBe(266);
  });

  it('point text compresses to the origin→card-edge zone (never past the card)', async () => {
    const design = designWithTextLayer({ content: 'ID' });
    // Origin 270, card 638, margin 4 → allowed 364. 60 chars ×6 = 360 fits;
    // 70 chars ×6 = 420 > 364 → ratio ≈ 0.867, width ≈ 364.
    const box = await inkBoxOf(design, { Name: 'x'.repeat(70) });
    expect(box.left).toBe(270);
    expect(box.right).toBeLessThanOrEqual(636); // 638 − 4 margin
    expect(box.right - box.left).toBeGreaterThanOrEqual(360);
  });

  it('explicit newlines in the VALUE still break lines (never squished across)', async () => {
    const design = designWithTextLayer({
      content: 'ID',
      shapeType: 'box',
      boxWidth: 204,
      boxHeight: 120,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    const box = await inkBoxOf(design, { Name: 'Alice\nJohnson' });
    // Two bands: baselines 551.47 and 611.47 (leading 60 preserved).
    expect(box.top).toBeLessThan(560);
    expect(box.bottom).toBeGreaterThan(600);
    // Each line fits the 204 px box naturally — no compression applied.
    expect(box.right - box.left).toBeLessThanOrEqual(50); // 7×6=42 widest
  });

  it('the design preview (sample text) is NEVER compressed — only substituted values are', async () => {
    // Sample one word wider than the box, so wrapping cannot mask the
    // difference: 15 chars × 6 = 90 px in a 60 px box. The substituted value
    // is a DIFFERENT long word (20 × 6 = 120 px) — a value equal to the
    // sample content IS the design preview by definition.
    const design = designWithTextLayer({
      content: 'Extraordinarily',
      shapeType: 'box',
      boxWidth: 60,
      boxHeight: 78,
      originX: 266,
      originY: 511.47,
      leading: 60,
    });
    // Empty substitution → the SAMPLE is drawn as authored: full natural
    // 90 px width, overflowing the box (the design canvas is the only clip).
    const previewBox = await inkBoxOf(design, { Name: '' });
    expect(previewBox.right - previewBox.left).toBeGreaterThanOrEqual(88);
    // A long SUBSTITUTED value compresses to the 60 px zone instead.
    const substitutedBox = await inkBoxOf(design, { Name: 'Internationalization' });
    expect(substitutedBox.right - substitutedBox.left).toBeLessThanOrEqual(63);
    expect(substitutedBox.right - substitutedBox.left).toBeGreaterThanOrEqual(55);
  });

  it('drop shadows compress WITH the squished glyphs (cast by the transformed shape)', async () => {
    const design = designWithTextLayer(
      {
        content: 'ID',
        shapeType: 'box',
        boxWidth: 60,
        boxHeight: 78,
        originX: 266,
        originY: 511.47,
        leading: 60,
      },
      {
        effects: {
          dropShadows: [
            { color: '#000000', opacity: 1, angle: 0, distance: 10, blur: 0 },
          ],
        },
      }
    );
    const canvas = await compositeDesign(design, options({ Name: 'Charmaine Patel' }));
    const textFills = collectTextFills(canvas);
    expect(textFills.length).toBeGreaterThan(0);
    // The shadow pass paints text fills too — both shadow and fill copies
    // must sit inside the compressed zone (≤ 60 px + shadow distance 10).
    const lefts = textFills.map((fill) => fill.x);
    const rights = textFills.map((fill) => fill.x + fill.w);
    expect(Math.min(...lefts)).toBeLessThanOrEqual(268);
    expect(Math.max(...rights)).toBeLessThanOrEqual(266 + 60 + 12);
  });

  it('a FULLY-WHITE (reveal-all) mask NEVER trims the substituted value — the "N in JOHNSON" bug', async () => {
    // THE BUG (v0.6.7): every Photoshop text layer carries a reveal-all
    // mask; ag-psd decodes masks as LUMINANCE with fully-opaque alpha, so
    // the old unconditional `destination-in` drawImage intersected the
    // value with the mask RECT — the SAMPLE's layer bounds (270–314 for
    // "ID"). "Alice Johnson" was amputated mid-glyph at x = 314.
    const design = designWithTextLayer({ content: 'ID' });
    const mask = makeMaskCanvas(44, 36, '#ffffff'); // sample's 44×36 ink rect
    design.layers[0]!.maskCanvas = mask;
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // 13 chars × 6 px = 78 px starting at 270 — NOT cut at the sample's
    // right edge (270 + 44 = 314). The full value must survive.
    expect(box.right - box.left).toBeGreaterThanOrEqual(76);
  });

  it('a partially-white mask keeps the masked part and honours hide-outside', async () => {
    // Real masking still works: white over 270–292 (keep), black beyond —
    // the value is cut at 292 + 2 px antialias tolerance, NOT at 314.
    const design = designWithTextLayer({ content: 'ID' });
    const mask = makeMaskCanvas(44, 36, '#ffffff');
    const context = mask.getContext('2d') as unknown as Mock2DContext;
    context.fillStyle = '#000000';
    context.fillRect(22, 0, 22, 36); // right half of the mask rect: hide
    design.layers[0]!.maskCanvas = mask;
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    expect(box.left).toBe(270);
    expect(box.right).toBeLessThanOrEqual(296);
  });

  it('a mask with defaultColor 255 (reveal outside the rect) keeps the overflow', async () => {
    // A black-inside/reveal-outside mask (Photoshop defaultColor 255):
    // the bitmap hides 270–314, but everything OUTSIDE the mask rect is
    // revealed — the overflow past 314 must SURVIVE the mask application.
    const design = designWithTextLayer({ content: 'ID' });
    const mask = makeMaskCanvas(44, 36, '#000000');
    design.layers[0]!.maskCanvas = mask;
    design.layers[0]!.maskDefaultColor = 255;
    const box = await inkBoxOf(design, { Name: 'Alice Johnson' });
    // Ink past the rect (314…) is untouched by the plane; only 270–314
    // itself is blacked out — the tail beyond must exist.
    expect(box.right).toBeGreaterThanOrEqual(340);
  });
});

/**
 * Forge a mask canvas of the given size filled with a CSS colour (white =
 * reveal-all like every Photoshop text layer; black = hide). Uses the mock
 * context so the fill is observable by the rasteriser.
 */
function makeMaskCanvas(width: number, height: number, fill: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d') as unknown as Mock2DContext;
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  return canvas;
}
