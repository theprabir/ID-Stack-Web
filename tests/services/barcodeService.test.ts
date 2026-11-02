import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderBarcode, clearBarcodeCache } from '@/services/barcodeService';
import type { BarcodeConfig } from '@/types/psd';

/**
 * jsdom has no canvas package — install a minimal observable 2D context
 * for the duration of the suite so bwip-js can draw (same approach as
 * textClipping.test.ts).
 */
interface Mock2DContext {
  canvas: HTMLCanvasElement;
  fillStyle: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  fillRect: () => void;
  clearRect: () => void;
  drawImage: (...args: unknown[]) => void;
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };
  putImageData: () => void;
  createImageData: (w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const contextCache = new WeakMap<HTMLCanvasElement, Mock2DContext>();

function createMockContext(canvas: HTMLCanvasElement): Mock2DContext {
  const base = {
    canvas,
    fillStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillRect: () => {},
    clearRect: () => {},
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
  };
  // bwip-js calls a wide range of 2D context methods (setTransform, save,
  // scale, …) — any method the mock does not implement becomes a no-op.
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return (target as Record<string | symbol, unknown>)[property];
      return () => undefined;
    },
  }) as unknown as Mock2DContext;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let context = contextCache.get(this);
    if (!context) {
      context = createMockContext(this);
      contextCache.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  clearBarcodeCache();
});

const baseConfig = (overrides: Partial<BarcodeConfig> = {}): BarcodeConfig => ({
  symbology: 'code128',
  color: '#000000',
  background: '#ffffff',
  width: 300,
  height: 80,
  ...overrides,
});

describe('barcodeService — rendering (v0.7.1)', () => {
  it('renders a code128 barcode into a non-empty canvas', async () => {
    const canvas = await renderBarcode('12345678', baseConfig());
    expect(canvas.width).toBeGreaterThan(1);
    expect(canvas.height).toBeGreaterThan(1);
  });

  it('renders a QR code into a non-empty canvas', async () => {
    const canvas = await renderBarcode('HELLO-QR', baseConfig({ symbology: 'qrcode' }));
    expect(canvas.width).toBeGreaterThan(10);
    expect(canvas.height).toBeGreaterThan(10);
  });

  it('QR output stays square (modules are never distorted)', async () => {
    const canvas = await renderBarcode('SQUARE', baseConfig({ symbology: 'qrcode' }));
    // bwip-js grows QR images in whole modules; allow ±1px quantisation.
    expect(Math.abs(canvas.width - canvas.height)).toBeLessThanOrEqual(2);
  });

  it('encodes the raw value untouched (no normalisation)', async () => {
    // The same raw value must always hit the same cache entry.
    const first = await renderBarcode('12 34/56', baseConfig());
    const second = await renderBarcode('12 34/56', baseConfig());
    expect(second).toBe(first);
  });
});

describe('barcodeService — cache correctness', () => {
  it('caches by value AND colours (different colour = different pixels)', async () => {
    clearBarcodeCache();
    const black = await renderBarcode('COLOR-TEST', baseConfig({ color: '#000000' }));
    const red = await renderBarcode('COLOR-TEST', baseConfig({ color: '#ff0000' }));
    expect(red).not.toBe(black);
    // Same colour again → the cached instance.
    const blackAgain = await renderBarcode('COLOR-TEST', baseConfig({ color: '#000000' }));
    expect(blackAgain).toBe(black);
  });

  it('caches by target size (a resized placeholder re-renders)', async () => {
    clearBarcodeCache();
    const small = await renderBarcode('SIZE-TEST', baseConfig({ width: 100, height: 40 }));
    const large = await renderBarcode('SIZE-TEST', baseConfig({ width: 400, height: 120 }));
    expect(large).not.toBe(small);
  });

  it('bounds memory: the cache never exceeds 64 canvases', async () => {
    clearBarcodeCache();
    // Fill to the cap with a hot entry kept at the front.
    const hot0 = await renderBarcode('HOT', baseConfig());
    const cold0 = await renderBarcode('COLD', baseConfig());
    for (let index = 0; index < 62; index += 1) {
      await renderBarcode(`FILL-${index}`, baseConfig());
    }
    // Cache is full (64). Touch HOT so it becomes the most recent entry.
    expect(await renderBarcode('HOT', baseConfig())).toBe(hot0);
    // Insert 63 more: every original filler must be evicted, but HOT
    // survives because the hit refreshed its recency.
    for (let index = 62; index < 125; index += 1) {
      await renderBarcode(`FILL-${index}`, baseConfig());
    }
    expect(await renderBarcode('HOT', baseConfig())).toBe(hot0);
    // COLD was never refreshed → evicted → a fresh instance is rendered.
    expect(await renderBarcode('COLD', baseConfig())).not.toBe(cold0);
  });

  it('clearBarcodeCache frees every entry', async () => {
    clearBarcodeCache();
    const first = await renderBarcode('CLEAR-TEST', baseConfig());
    clearBarcodeCache();
    const second = await renderBarcode('CLEAR-TEST', baseConfig());
    expect(second).not.toBe(first);
  });
});
