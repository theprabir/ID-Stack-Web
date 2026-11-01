/** Barcode/QR code generation service (v0.1.0).
 * Uses bwip-js for rendering barcodes and QR codes to canvas.
 * Provides JIT rendering with caching to prevent redundant generation.
 */

/** Supported barcode symbologies */
export type BarcodeSymbology = 'code128' | 'qrcode' | 'ean13' | 'code39';

/** Barcode configuration */
export interface BarcodeConfig {
  symbology: BarcodeSymbology;
  color: string;
  width: number;
  height: number;
}

/** Cached barcode canvas: key is symbology + value */
const barcodeCache = new Map<string, HTMLCanvasElement>();

/** Render a barcode/QR code to a canvas element */
export async function renderBarcode(
  value: string,
  config: BarcodeConfig
): Promise<HTMLCanvasElement> {
  // Check cache first - key is symbology + value
  const cacheKey = `${config.symbology}:${value}`;
  if (barcodeCache.has(cacheKey)) {
    return barcodeCache.get(cacheKey)!;
  }

  // Use bwip-js for barcode generation
  // @ts-ignore - bwip-js types not fully compatible with bundler moduleResolution
  const bwip: any = await import('bwip-js');

  return new Promise((resolve, reject) => {
    ;(bwip as any).toCanvas(
      {
        bcid: config.symbology,
        text: value,
        height: config.height,
        includetext: false,
        textxunits: 0.01,
        textyunits: 0.01,
        margin: 2,
        displayValue: false,
        rotate: 0,
        sound: false,
        moduleWidth: 0.2,
        moduleHeight: 0.2,
        rowHeight: 1,
        color: config.color,
      },
      (err: Error | null, canvas: HTMLCanvasElement) => {
        if (err) {
          reject(err);
          return;
        }

        // Cache the result
        barcodeCache.set(cacheKey, canvas);

        resolve(canvas);
      }
    );
  });
}

/** Clear the barcode cache to free memory */
export function clearBarcodeCache(): void {
  barcodeCache.clear();
}