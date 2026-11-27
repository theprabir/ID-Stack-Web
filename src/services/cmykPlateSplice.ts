/**
 * Colour-safe CMYK plate splicing (v0.7.8).
 *
 * WHY: the exact sRGB→CMYK transform (`FLAGS_NOOPTIMIZE`) costs ~149 ms per
 * 650×1028 card, yet only ~14 % of a demo card differs between records — the
 * photo and the text fields. Re-transforming the untouched 86 % of pixels for
 * every card is pure waste, but switching to LittleCMS's optimised CLUT to
 * avoid it would change the printed values, which is not acceptable.
 *
 * So the first card of a batch becomes a PLATE: its RGBA and its exactly
 * transformed CMYK are cached. Every later card is compared with the plate and
 * only the pixels that actually differ are transformed; everything else is
 * copied from the plate's CMYK buffer.
 *
 * BYTE-IDENTITY: the colour transform is per-pixel and deterministic (no
 * spatial filtering, same profile, same intent, same flags), so for any pixel
 * whose RGB bytes equal the plate's, `T(card) == T(plate)` exactly. Differing
 * pixels are transformed from their own bytes. The spliced buffer is therefore
 * identical to transforming the whole card — asserted by
 * `tests/services/cmykPlateSplice.test.ts` and verified in the app against a
 * full transform.
 *
 * A plate is defined by its buffers alone, not by width/height: the comparison
 * is per pixel index, and equal RGB at the same index implies equal CMYK
 * whatever the geometry, so dimensions could only affect the hit rate — never
 * the bytes.
 *
 * Alpha is ignored on purpose: `canvasToCmykBytes` drops it, so two pixels with
 * the same RGB but different alpha produce the same CMYK.
 */

/** A transformed reference card: its pixels and their exact CMYK */
export interface CmykPlate {
  /** RGBA pixels, 4 bytes per pixel, row-major (the card's exact length) */
  rgba: Uint8Array;
  /** The plate's CMYK samples — exactly `transform(rgba)` */
  cmyk: Uint8Array;
}

/** Result of splicing one card onto the plate */
export interface PlateSpliceResult {
  /** Complete CMYK buffer for this card (plate copy + transformed changes) */
  cmyk: Uint8Array;
  /** Pixels whose RGB differed from the plate and were transformed */
  changedPixels: number;
}

/** Runs the ICC transform over `rgb` (3 bytes per pixel); returns CMYK samples */
export type RgbToCmykTransform = (rgb: Uint8Array, pixelCount: number) => Uint8Array;

/** Bytes per RGBA pixel / per CMYK sample */
const BYTES_PER_PIXEL = 4;

/**
 * Build a card's CMYK buffer from a plate plus a transform of what changed.
 *
 * @param card - The card's RGBA pixels (4 bytes per pixel)
 * @param plate - Cached plate RGBA + its already-transformed CMYK
 * @param transform - The exact sRGB→CMYK transform
 * @returns The spliced CMYK buffer and how many pixels were transformed, or
 *          `null` when this card cannot be spliced safely (different size,
 *          mismatched buffers, misaligned views). The caller must then
 *          transform the whole card.
 */
export function spliceCardOntoPlate(
  card: Uint8Array,
  plate: CmykPlate,
  transform: RgbToCmykTransform
): PlateSpliceResult | null {
  const plateBytes = plate.rgba.length;
  if (plateBytes === 0 || plateBytes % BYTES_PER_PIXEL !== 0) return null;
  // Same area is required: a differently sized card has no pixel in common.
  if (card.length !== plateBytes) return null;
  if (plate.cmyk.length !== plateBytes) return null;
  // The 32-bit comparison below needs 4-byte-aligned views.
  if ((card.byteOffset & 3) !== 0 || (plate.rgba.byteOffset & 3) !== 0) return null;

  const pixelCount = plateBytes / BYTES_PER_PIXEL;

  // Fast whole-pixel comparison (one 32-bit load per pixel).
  const cardWords = new Uint32Array(card.buffer, card.byteOffset, pixelCount);
  const plateWords = new Uint32Array(plate.rgba.buffer, plate.rgba.byteOffset, pixelCount);

  let differing = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (cardWords[pixel] !== plateWords[pixel]) differing += 1;
  }

  if (differing === 0) {
    return { cmyk: plate.cmyk.slice(), changedPixels: 0 };
  }

  // Gather the pixels whose RGB actually changed (a 32-bit difference may be
  // an alpha-only difference, which cannot change the CMYK values).
  const rgb = new Uint8Array(differing * 3);
  const positions = new Int32Array(differing);
  let changed = 0;
  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    if (cardWords[pixel] === plateWords[pixel]) continue;
    const red = card[index] ?? 0;
    const green = card[index + 1] ?? 0;
    const blue = card[index + 2] ?? 0;
    if (
      red === (plate.rgba[index] ?? 0) &&
      green === (plate.rgba[index + 1] ?? 0) &&
      blue === (plate.rgba[index + 2] ?? 0)
    ) {
      continue;
    }
    positions[changed] = pixel;
    rgb[changed * 3] = red;
    rgb[changed * 3 + 1] = green;
    rgb[changed * 3 + 2] = blue;
    changed += 1;
  }

  const cmyk = plate.cmyk.slice();
  if (changed === 0) return { cmyk, changedPixels: 0 };

  const transformed = transform(rgb, changed);
  if (transformed.length < changed * BYTES_PER_PIXEL) {
    throw new Error('CMYK plate splice: the transform returned too few samples.');
  }
  for (let entry = 0; entry < changed; entry += 1) {
    const source = entry * BYTES_PER_PIXEL;
    const target = (positions[entry] ?? 0) * BYTES_PER_PIXEL;
    cmyk[target] = transformed[source] ?? 0;
    cmyk[target + 1] = transformed[source + 1] ?? 0;
    cmyk[target + 2] = transformed[source + 2] ?? 0;
    cmyk[target + 3] = transformed[source + 3] ?? 0;
  }
  return { cmyk, changedPixels: changed };
}
