/**
 * Shared ink (opaque-pixel) scanner.
 *
 * The single source of truth for "what does this bitmap actually look
 * like": bounding box of opaque pixels, how densely the box is filled
 * (weight indicator), horizontal drift of the glyph column centroid from
 * bottom to top (italic/slant indicator) and the mean colour of solid
 * pixels (true fill colour, post-Photoshop-effects).
 *
 * Used at PARSE time (measure the PSD's original text raster → the style
 * oracle) and at RENDER time (measure the re-rendered placeholder → verify
 * it matches the oracle). Photoshop drew the original pixels, so matching
 * them cannot be wrong regardless of engine-data quirks.
 */

/** Alpha above this counts as ink */
const ALPHA_THRESHOLD = 8;
/** Alpha at/above this contributes to the mean fill colour */
const SOLID_ALPHA_THRESHOLD = 200;

/** Ink statistics shared by rasters and re-rendered placeholders */
export interface InkStats {
  /** Opaque-pixel bounding box height (px) */
  inkHeight: number;
  /** Opaque-pixel bounding box width (px) */
  inkWidth: number;
  /** Opaque pixels ÷ bounding-box area — bold text fills more of its box */
  inkDensity: number;
  /**
   * (top-quarter centroid x − bottom-quarter centroid x) ÷ inkHeight —
   * italic text leans right at the top, giving values ≈ 0.2–0.35;
   * upright text ≈ 0.
   */
  slant: number;
}

/** Ink statistics plus the measured fill colour and box (rasters only) */
export interface RasterInkStats extends InkStats {
  /** Mean RGB of high-alpha pixels, when enough were sampled */
  meanColor: { r: number; g: number; b: number } | null;
  /** Ink bounding box within the scanned canvas (left/top inclusive, right/bottom exclusive) */
  inkLeft: number;
  inkTop: number;
  inkRight: number;
  inkBottom: number;
}

/** Raw one-pass scan result (internal) */
interface PixelScan {
  top: number;
  bottom: number;
  left: number;
  right: number;
  opaqueCount: number;
  rgbSumR: number;
  rgbSumG: number;
  rgbSumB: number;
  rgbCount: number;
  topCentroidX: number;
  bottomCentroidX: number;
}

/**
 * One pass over raw RGBA pixels: ink bounding box, opaque count, mean
 * colour of solid pixels and row-centroid x for the top/bottom ink
 * quarters (slant detection).
 */
function scanPixels(data: Uint8ClampedArray, width: number, height: number): PixelScan | null {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  let opaqueCount = 0;
  let rgbSumR = 0;
  let rgbSumG = 0;
  let rgbSumB = 0;
  let rgbCount = 0;
  const rowAlphaCount = new Int32Array(height);
  const rowXSum = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(rowOffset + x) * 4 + 3] ?? 0;
      if (alpha <= ALPHA_THRESHOLD) continue;
      opaqueCount += 1;
      rowAlphaCount[y] = (rowAlphaCount[y] ?? 0) + 1;
      rowXSum[y] = (rowXSum[y] ?? 0) + x;
      if (x < left) left = x;
      if (x > right) right = x;
      if (top === -1) top = y;
      bottom = y;
      if (alpha >= SOLID_ALPHA_THRESHOLD) {
        rgbSumR += data[(rowOffset + x) * 4] ?? 0;
        rgbSumG += data[(rowOffset + x) * 4 + 1] ?? 0;
        rgbSumB += data[(rowOffset + x) * 4 + 2] ?? 0;
        rgbCount += 1;
      }
    }
  }
  if (top === -1 || bottom === -1 || right < left) return null;
  const inkHeight = bottom - top + 1;
  const quarter = Math.max(1, Math.floor(inkHeight / 4));
  let topXSum = 0;
  let topCount = 0;
  for (let y = top; y < Math.min(top + quarter, height); y += 1) {
    if ((rowAlphaCount[y] ?? 0) > 0) {
      topXSum += rowXSum[y] ?? 0;
      topCount += rowAlphaCount[y] ?? 0;
    }
  }
  let bottomXSum = 0;
  let bottomCount = 0;
  for (let y = Math.max(bottom - quarter + 1, 0); y <= bottom; y += 1) {
    if ((rowAlphaCount[y] ?? 0) > 0) {
      bottomXSum += rowXSum[y] ?? 0;
      bottomCount += rowAlphaCount[y] ?? 0;
    }
  }
  return {
    top,
    bottom,
    left,
    right,
    opaqueCount,
    rgbSumR,
    rgbSumG,
    rgbSumB,
    rgbCount,
    topCentroidX: topCount > 0 ? topXSum / topCount : 0,
    bottomCentroidX: bottomCount > 0 ? bottomXSum / bottomCount : 0,
  };
}

/** Build InkStats from a raw scan */
export function statsFromScan(scan: PixelScan): RasterInkStats {
  const inkHeight = scan.bottom - scan.top + 1;
  const inkWidth = scan.right - scan.left + 1;
  return {
    inkHeight,
    inkWidth,
    inkDensity: scan.opaqueCount / (inkWidth * inkHeight),
    slant: inkHeight > 8 ? (scan.topCentroidX - scan.bottomCentroidX) / inkHeight : 0,
    inkLeft: scan.left,
    inkTop: scan.top,
    inkRight: scan.right + 1,
    inkBottom: scan.bottom + 1,
    meanColor:
      scan.rgbCount >= 50
        ? {
            r: Math.round(scan.rgbSumR / scan.rgbCount),
            g: Math.round(scan.rgbSumG / scan.rgbCount),
            b: Math.round(scan.rgbSumB / scan.rgbCount),
          }
        : null,
  };
}

/**
 * Measure the ink statistics of a canvas: bounding box, density, slant and
 * mean solid colour. Returns null for empty/degenerate bitmaps.
 */
export function measureCanvasInk(canvas: HTMLCanvasElement): RasterInkStats | null {
  if (canvas.width === 0 || canvas.height === 0) return null;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const scan = scanPixels(data, canvas.width, canvas.height);
    if (!scan) return null;
    return statsFromScan(scan);
  } catch {
    return null;
  }
}

/** Convert measured mean colour to a hex string (null passthrough) */
export function inkColorToHex(color: { r: number; g: number; b: number } | null): string | null {
  if (!color) return null;
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Raw RGBA read of a canvas (shared by positioned ink measurement) */
export function readPixels(canvas: HTMLCanvasElement): ImageData | null {
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

export { scanPixels, ALPHA_THRESHOLD, SOLID_ALPHA_THRESHOLD };
