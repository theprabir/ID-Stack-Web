/**
 * ag-psd CMYK compatibility + core parse wrapper.
 *
 * WHY THIS MODULE EXISTS
 * ag-psd internally converts CMYK image data to RGB (psdReader.js ships a
 * full cmykToRgb decoder for RLE compression), but its `supportedColorModes`
 * whitelist only lists bitmap/grayscale/indexed/RGB, so CMYK files throw
 * "Color mode not supported: CMYK".
 *
 * HOW THE PATCH WORKS
 * ag-psd ships CommonJS ("dist/") and an ESM-flavoured "dist-es/" that is
 * actually still CJS at runtime — importing either directly in a browser
 * breaks ("exports is not defined"). Instead we call the reader functions
 * (`createReader` + `readPsd`) from the SAME CJS module we patch, through
 * Vite's CJS interop. Mutating the exported array before every parse is
 * therefore guaranteed to affect the actual parsing code path.
 *
 * Everything else in the app imports readPsd from HERE, never from 'ag-psd'
 * directly, so the patched path is the only path.
 */

// CJS module — Vite interop gives us { createReader, readPsd, supportedColorModes, ... }
import * as psdReaderInterop from 'ag-psd/dist/psdReader.js';

/** Photoshop ColorMode identifier for CMYK */
const CMYK = 4;

type ReaderModule = {
  createReader: (...args: unknown[]) => unknown;
  readPsd: (reader: unknown, options: Record<string, unknown>) => unknown;
  supportedColorModes?: number[];
};

function getReaderModule(): ReaderModule {
  const mod = psdReaderInterop as unknown as ReaderModule & {
    default?: ReaderModule;
  };
  return typeof mod.createReader === 'function' ? mod : (mod.default as ReaderModule);
}

/**
 * Add CMYK to ag-psd's supported color modes (idempotent).
 * Called once at module load and re-asserted before every parse.
 */
export function applyPsdColorModePatch(): void {
  const modes = getReaderModule().supportedColorModes;
  if (Array.isArray(modes) && !modes.includes(CMYK)) {
    modes.push(CMYK);
  }
}

/** Diagnostic helper: whether CMYK is currently whitelisted */
export function isCmykPatched(): boolean {
  const modes = getReaderModule().supportedColorModes;
  return Array.isArray(modes) && modes.includes(CMYK);
}

/** Options accepted by ag-psd's readPsd */
export type ReadPsdOptions = {
  skipLayerImageData?: boolean;
  skipCompositeImageData?: boolean;
  skipThumbnail?: boolean;
  skipLinkedFilesData?: boolean;
  useImageData?: boolean;
  throwForMissingFeatures?: boolean;
  logMissingFeatures?: boolean;
};

/**
 * Parse a PSD buffer with the CMYK patch guaranteed to be applied.
 * Mirrors the public ag-psd readPsd entry, but routed through the patched
 * reader module.
 *
 * @param buffer - Raw PSD file bytes
 * @param options - ag-psd read options
 * @returns Parsed Psd object
 */
export function readPsdPatched(buffer: ArrayBuffer, options: ReadPsdOptions = {}): unknown {
  applyPsdColorModePatch();
  const mod = getReaderModule();
  const bufferView = new Uint8Array(buffer);
  const reader = mod.createReader(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
  return mod.readPsd(reader, options as Record<string, unknown>);
}
