/**
 * ag-psd CMYK compatibility patch.
 *
 * ag-psd internally converts CMYK image data to RGB (psdReader.js ships a
 * full cmykToRgb decoder for RLE compression), but its
 * `supportedColorModes` whitelist only lists bitmap/grayscale/indexed/RGB,
 * so CMYK files throw "Color mode not supported: CMYK".
 *
 * Importing 'ag-psd/dist/psdReader.js' directly resolves to the SAME module
 * instance the public readPsd entry uses (ag-psd has no "exports" map in its
 * package.json), so mutating the exported array is safe and global.
 */

import psdReader from 'ag-psd/dist/psdReader.js';

/** Photoshop ColorMode identifier for CMYK */
const CMYK = 4;

/**
 * Add CMYK to ag-psd's supported color modes (idempotent).
 * Called once at module load from psdService.
 */
export function applyPsdColorModePatch(): void {
  const modes = (
    psdReader as unknown as { supportedColorModes?: number[] }
  ).supportedColorModes;
  if (Array.isArray(modes) && !modes.includes(CMYK)) {
    modes.push(CMYK);
  }
}
