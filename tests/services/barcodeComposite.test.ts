import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compositeDesign } from '@/services/psdCompositeService';
import { clearBarcodeCache } from '@/services/barcodeService';
import type { PsdDesign, PsdLayerInfo, PsdPlaceholder } from '@/types/psd';
import type { DataRow } from '@/types/data';

/**
 * v0.7.1 — IMAGE-AS-BARCODE integration: any demo image layer chosen as a
 * barcode placeholder is replaced by a live symbol sized to its exact box.
 * Uses a recording 2D context so the composited fill graph is observable.
 */

interface FillRecord {
  kind: 'rect' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  source?: HTMLCanvasElement;
}

const contextCache = new WeakMap<HTMLCanvasElement, FillRecord[]>();
/** Separate registry: canvas → its recording context instance */
const recordingContexts = new WeakMap<HTMLCanvasElement, RecordingContext>();
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function isCanvas(value: unknown): value is HTMLCanvasElement {
  return value instanceof HTMLCanvasElement;
}

class RecordingContext {
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  private fills(): FillRecord[] {
    let list = contextCache.get(this.canvas);
    if (!list) {
      list = [];
      contextCache.set(this.canvas, list);
    }
    return list;
  }

  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  setTransform(): void {}
  resetTransform(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  arcTo(): void {}
  rect(): void {}
  fill(): void {}
  stroke(): void {}
  clip(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills().push({ kind: 'rect', x, y, w, h, color: String(this.fillStyle) });
  }
  strokeRect(): void {}
  clearRect(): void {}
  fillText(): void {}
  strokeText(): void {}
  setLineDash(): void {}
  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  createPattern(): null {
    return null;
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 6 } as unknown as TextMetrics;
  }
  createImageData(w: number, h: number): ImageData {
    return {
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    } as unknown as ImageData;
  }
  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    return {
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    } as unknown as ImageData;
  }
  putImageData(): void {}
  drawImage(
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number
  ): void {
    // Record EVERY draw — element sources (photos, rasters) carry an
    // undefined source so canvas-walking helpers still ignore them.
    const canvasSource = isCanvas(source) ? source : undefined;
    this.fills().push({
      kind: 'image',
      x: dx,
      y: dy,
      w: dw ?? canvasSource?.width ?? 0,
      h: dh ?? canvasSource?.height ?? 0,
      color: '',
      source: canvasSource,
    });
  }
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    // One recording context per canvas (mirrors browser identity semantics:
    // repeated getContext calls must return the same object or the fill
    // history resets between the renderer's calls and the test's reads).
    const existing = recordingContexts.get(this);
    if (existing) return existing as unknown as CanvasRenderingContext2D;
    const created = new RecordingContext(this);
    recordingContexts.set(this, created);
    return created as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  clearBarcodeCache();
});

/** Fill records of a canvas (as recorded by its context) */
function fillsOf(canvas: HTMLCanvasElement): FillRecord[] {
  return contextCache.get(canvas) ?? [];
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** 300×80 demo-barcode image layer at (100, 200) */
const imageLayer: PsdLayerInfo = {
  id: 'front/Code',
  name: 'Code',
  path: ['Code'],
  kind: 'image',
  hidden: false,
  bounds: { left: 100, top: 200, right: 400, bottom: 280 },
  opacity: 1,
  blendMode: 'normal',
  hasPixels: true,
  hasEffects: false,
  clipped: false,
  childCount: 0,
};

const design: PsdDesign = {
  fileName: 'barcode-test.psd',
  width: 500,
  height: 800,
  horizontalResolution: 300,
  layers: [imageLayer],
  compositeUrl: '',
  layerRasters: {},
};

const makePlaceholder = (overrides: Partial<PsdPlaceholder> = {}): PsdPlaceholder => ({
  layerId: 'front/Code',
  layerName: 'Code',
  role: 'barcode',
  side: 'front',
  key: 'Code',
  barcodeEnabled: true,
  barcodeConfig: {
    symbology: 'code128',
    color: '#000000',
    background: '#ffffff',
    width: 300,
    height: 80,
  },
  ...overrides,
});

const row: DataRow = { rowIndex: 0, values: { Barcode: '12345678' } };

const options = (placeholder: PsdPlaceholder, value = '12345678') => ({
  placeholders: [placeholder],
  mappings: { Code: 'Barcode' },
  row: { ...row, values: { Barcode: value } },
  backgroundColor: '#ffffff',
});

/** The card → stage → barcode fill chain, asserted by the tests below */
function findBarcodeChain(card: HTMLCanvasElement): {
  stage: HTMLCanvasElement;
  barcode: HTMLCanvasElement;
} | null {
  const cardImage = fillsOf(card).find((fill) => fill.kind === 'image' && fill.source);
  const stage = cardImage?.source;
  if (!stage) return null;
  const stageFills = fillsOf(stage);
  const barcodeImage = stageFills.find((fill) => fill.kind === 'image' && fill.source);
  if (!barcodeImage?.source) return null;
  return { stage, barcode: barcodeImage.source };
}

describe('compositeDesign — image-as-barcode placeholders (v0.7.1)', () => {
  it('renders a live barcode sized to the exact placeholder box', async () => {
    clearBarcodeCache();
    const card = await compositeDesign(design, options(makePlaceholder()));

    const chain = findBarcodeChain(card);
    expect(chain).not.toBeNull();

    // 1. The stage carries the background fill at the layer's exact bounds.
    const backgroundFill = fillsOf(chain!.stage).find((fill) => fill.kind === 'rect');
    expect(backgroundFill).toMatchObject({ x: 100, y: 200, w: 300, h: 80 });

    // 2. A real symbol canvas (non-trivial size) was drawn on the stage.
    expect(chain!.barcode.width).toBeGreaterThan(1);
    expect(chain!.barcode.height).toBeGreaterThan(1);

    // 3. The symbol is drawn INSIDE the placeholder box (contain-fit).
    const symbolDraw = fillsOf(chain!.stage).find(
      (fill) => fill.kind === 'image' && fill.source === chain!.barcode
    );
    expect(symbolDraw).toBeDefined();
    expect(symbolDraw!.x).toBeGreaterThanOrEqual(100);
    expect(symbolDraw!.y).toBeGreaterThanOrEqual(200);
    expect(symbolDraw!.x + symbolDraw!.w).toBeLessThanOrEqual(400 + 1);
    expect(symbolDraw!.y + symbolDraw!.h).toBeLessThanOrEqual(280 + 1);
  });

  it('toggle OFF keeps the demo image path (no live barcode drawn)', async () => {
    clearBarcodeCache();
    const card = await compositeDesign(
      design,
      options(makePlaceholder({ barcodeEnabled: false }))
    );
    // No stage image at all — the raster fallback draws nothing without a
    // stored raster, and no barcode stage is composited.
    expect(findBarcodeChain(card)).toBeNull();
  });

  it('an empty mapped value falls back to the demo image (no barcode)', async () => {
    clearBarcodeCache();
    const card = await compositeDesign(design, options(makePlaceholder(), ''));
    expect(findBarcodeChain(card)).toBeNull();
  });

  it('an invalid value for the symbology never throws (EAN-13 + letters)', async () => {
    clearBarcodeCache();
    const card = await compositeDesign(
      design,
      options(makePlaceholder({ barcodeConfig: {
        symbology: 'ean13',
        color: '#000000',
        background: '#ffffff',
        width: 300,
        height: 80,
      } }), 'NOT-A-NUMBER')
    );
    // Graceful fallback: no barcode stage, card still composited.
    expect(card.width).toBe(500);
    expect(findBarcodeChain(card)).toBeNull();
  });

  it('QR placeholders render a square symbol', async () => {
    clearBarcodeCache();
    const card = await compositeDesign(
      design,
      options(
        makePlaceholder({
          barcodeConfig: {
            symbology: 'qrcode',
            color: '#000000',
            background: '#ffffff',
            width: 300,
            height: 80,
          },
        })
      )
    );
    const chain = findBarcodeChain(card);
    expect(chain).not.toBeNull();
    // bwip-js grows QR images in whole modules — ±2px quantisation allowed.
    expect(Math.abs(chain!.barcode.width - chain!.barcode.height)).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* v0.7.2 — a record without a photo renders a BLANK image area         */
/* ------------------------------------------------------------------ */
describe('compositeDesign — missing photo stays blank (v0.7.2)', () => {
  const photoLayer: PsdLayerInfo = {
    id: 'front/Photo',
    name: 'Photo',
    path: ['Photo'],
    kind: 'image',
    hidden: false,
    bounds: { left: 50, top: 60, right: 250, bottom: 320 },
    opacity: 1,
    blendMode: 'normal',
    hasPixels: true,
    hasEffects: false,
    clipped: false,
    childCount: 0,
  };
  const photoDesign: PsdDesign = {
    fileName: 'photo-blank.psd',
    width: 500,
    height: 800,
    horizontalResolution: 300,
    layers: [photoLayer],
    compositeUrl: '',
    // The PSD's demo photo — must NEVER appear for a record without one.
    layerRasters: { 'front/Photo': 'data:image/png;base64,iVBORw0KGgo=' },
  };
  const photoPlaceholder: PsdPlaceholder = {
    layerId: 'front/Photo',
    layerName: 'Photo',
    role: 'photo',
    side: 'front',
    key: 'Photo',
  };

  it('no matched photo → the demo image is NOT drawn (blank area)', async () => {
    const card = await compositeDesign(photoDesign, {
      placeholders: [photoPlaceholder],
      mappings: { Photo: 'PhotoFile' },
      row: { rowIndex: 0, values: { PhotoFile: 'missing.png' } },
      getPhoto: () => undefined,
      backgroundColor: '#ffffff',
    });
    expect(fillsOf(card).filter((fill) => fill.kind === 'image')).toHaveLength(0);
  });

  /** The frame/backdrop designers place the portrait in (same bounds) */
  const frameLayer: PsdLayerInfo = {
    ...photoLayer,
    id: 'front/Frame',
    name: 'Frame',
  };
  const frameDesign: PsdDesign = {
    ...photoDesign,
    layers: [frameLayer, photoLayer],
    layerRasters: {
      'front/Photo': 'data:image/png;base64,iVBORw0KGgo=',
      'front/Frame': 'data:image/png;base64,iVBORw0KGgo=',
    },
  };

  it('v0.7.3 — also hides the frame layer beneath the photo (same bounds)', async () => {
    const card = await compositeDesign(frameDesign, {
      placeholders: [photoPlaceholder],
      mappings: { Photo: 'PhotoFile' },
      row: { rowIndex: 0, values: { PhotoFile: 'missing.png' } },
      getPhoto: () => undefined,
      backgroundColor: '#ffffff',
    });
    // Neither the demo photo nor its oval frame may be painted: the area is
    // fully transparent so the card background shows through.
    expect(fillsOf(card).filter((fill) => fill.kind === 'image')).toHaveLength(0);
  });

  it('keeps a layer beneath the photo when its bounds differ (no over-hiding)', async () => {
    const backdropLayer: PsdLayerInfo = {
      ...frameLayer,
      bounds: { left: 0, top: 0, right: 500, bottom: 800 },
    };
    const card = await compositeDesign(
      {
        ...frameDesign,
        layers: [backdropLayer, photoLayer],
        layerRasters: {
          ...frameDesign.layerRasters,
          'front/Frame': 'data:image/png;base64,iVBORw0KGgo=',
        },
      },
      {
        placeholders: [photoPlaceholder],
        mappings: { Photo: 'PhotoFile' },
        row: { rowIndex: 0, values: { PhotoFile: 'missing.png' } },
        getPhoto: () => undefined,
        backgroundColor: '#ffffff',
      }
    );
    // The card-wide background layer is untouched (only the photo is skipped).
    expect(fillsOf(card).filter((fill) => fill.kind === 'image').length).toBeGreaterThan(0);
  });

  it('with a photo, the frame stays painted (positive control)', async () => {
    const photo = {
      id: 'p1',
      fileName: 'student.png',
      baseName: 'student',
      blobUrl: 'blob:student',
      file: new File(['x'], 'student.png', { type: 'image/png' }),
      width: 100,
      height: 100,
    };
    const card = await compositeDesign(frameDesign, {
      placeholders: [photoPlaceholder],
      mappings: { Photo: 'PhotoFile' },
      row: { rowIndex: 0, values: { PhotoFile: 'student.png' } },
      getPhoto: () => photo,
      backgroundColor: '#ffffff',
    });
    expect(fillsOf(card).filter((fill) => fill.kind === 'image').length).toBeGreaterThan(0);
  });

  it('design preview (no row) keeps the frame as authored', async () => {
    const card = await compositeDesign(frameDesign, {
      placeholders: [photoPlaceholder],
      mappings: { Photo: 'PhotoFile' },
      row: null,
      backgroundColor: '#ffffff',
    });
    // Frame still visible so the design reads correctly while choosing layers.
    expect(fillsOf(card).filter((fill) => fill.kind === 'image').length).toBeGreaterThan(0);
  });

  it('a matched photo IS drawn (positive control)', async () => {
    const photo = {
      id: 'p1',
      fileName: 'student.png',
      baseName: 'student',
      blobUrl: 'blob:student',
      file: new File(['x'], 'student.png', { type: 'image/png' }),
      width: 100,
      height: 100,
    };
    const card = await compositeDesign(photoDesign, {
      placeholders: [photoPlaceholder],
      mappings: { Photo: 'PhotoFile' },
      row: { rowIndex: 0, values: { PhotoFile: 'student.png' } },
      getPhoto: () => photo,
      backgroundColor: '#ffffff',
    });
    expect(fillsOf(card).filter((fill) => fill.kind === 'image').length).toBeGreaterThan(0);
  });
});
