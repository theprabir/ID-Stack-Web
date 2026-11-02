/**
 * Barcode/QR code generation service (v0.7.1).
 *
 * Renders barcodes with bwip-js directly into a canvas sized for the
 * placeholder layer they fill:
 * - The symbol is rendered in two passes: a natural-size pass to measure
 *   the module grid, then an integer-scale pass so modules stay crisp.
 * - Results are cached in a small LRU (keyed by value + colours + size)
 *   so batch generation over thousands of rows never grows memory
 *   without bound.
 *
 * The canvas returned is the bwip-js render (its own background colour);
 * the composite service contain-fits it into the exact placeholder box
 * over a matching background fill, so the element always occupies the
 * placeholder's exact width × height without distorting the modules.
 */
import type { BarcodeConfig } from '@/types/psd';

/** Supported barcode symbologies (subset of bwip-js bcids used by the UI) */
export type BarcodeSymbology = BarcodeConfig['symbology'];

/** px → millimeters at the 72 dpi bwip-js renders at (1 pt = 1 px) */
const PX_TO_MM = 25.4 / 72;

/**
 * Maximum cached barcode canvases. The Map preserves insertion order and
 * is re-set on every hit, so the first key is always the least recently
 * used one.
 */
const MAX_CACHED_BARCODES = 64;

/** Cached barcode canvases: render key → canvas (bounded LRU) */
const barcodeCache = new Map<string, HTMLCanvasElement>();

/** Cache key includes colours and target size — all affect the pixels. */
function cacheKey(value: string, config: BarcodeConfig): string {
  return `${config.symbology}|${config.color}|${config.background}|${config.width}x${config.height}|${value}`;
}

/** bwip-js options for one render pass. Linear symbols get their bar
 * height in millimeters scaled by the requested module scale (bwip-js
 * multiplies `height` by `scale`). */
function buildOptions(
  value: string,
  config: BarcodeConfig,
  scale: number
): Record<string, string | number | boolean> {
  const linear = config.symbology !== 'qrcode';
  const targetHeightMm = Math.max(1, config.height) * PX_TO_MM;
  return {
    bcid: config.symbology,
    text: value,
    scale,
    margin: 2,
    barcolor: config.color,
    backgroundcolor: config.background,
    includetext: false,
    ...(linear ? { height: targetHeightMm / scale } : {}),
  };
}

/**
 * Render a barcode/QR code for `value` into a canvas.
 *
 * @param value - Raw text to encode (passed through untouched — no
 *   normalisation, so legacy-encoded data survives as-is)
 * @param config - Symbology, colours and target placeholder size (px)
 * @returns The rendered canvas (cached between calls with the same inputs)
 */
export async function renderBarcode(
  value: string,
  config: BarcodeConfig
): Promise<HTMLCanvasElement> {
  const key = cacheKey(value, config);
  const cached = barcodeCache.get(key);
  if (cached) {
    // Refresh recency so hot rows are not evicted.
    barcodeCache.delete(key);
    barcodeCache.set(key, cached);
    return cached;
  }

  // bwip-js v4 is synchronous (`toCanvas(canvas, options)`); it is loaded
  // lazily so the main bundle only pulls it in when a barcode is rendered.
  // The `bwip-js/browser` subpath is the conditional export whose types
  // resolve under `moduleResolution: "bundler"` (the bare specifier has
  // only condition-nested type entries).
  const bwip = (await import('bwip-js/browser')) as unknown as {
    toCanvas(canvas: HTMLCanvasElement, opts: Record<string, unknown>): HTMLCanvasElement;
  };

  const canvas = document.createElement('canvas');
  const targetWidth = Math.max(1, Math.round(config.width));
  const targetHeight = Math.max(1, Math.round(config.height));

  // Pass 1 — natural size at scale 1 (measures the module grid).
  bwip.toCanvas(canvas, buildOptions(value, config, 1));
  const naturalWidth = Math.max(1, canvas.width);
  const naturalHeight = Math.max(1, canvas.height);

  // Pass 2 — largest integer module scale that still fits the placeholder
  // box (bwip-js grows images in whole-module "quantums", so an integer
  // scale keeps every bar/module a whole number of pixels).
  const fitScale = Math.max(
    1,
    Math.floor(Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight))
  );
  if (fitScale > 1) {
    bwip.toCanvas(canvas, buildOptions(value, config, fitScale));
  }

  // Bounded LRU: evict the least recently used entry.
  barcodeCache.set(key, canvas);
  while (barcodeCache.size > MAX_CACHED_BARCODES) {
    const oldest = barcodeCache.keys().next().value;
    if (oldest === undefined) break;
    barcodeCache.delete(oldest);
  }

  return canvas;
}

/** Clear the barcode cache to free memory (e.g. after a batch run) */
export function clearBarcodeCache(): void {
  barcodeCache.clear();
}
