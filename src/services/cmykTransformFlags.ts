/**
 * LittleCMS transform flags for the sRGB→CMYK conversion.
 *
 * Shared by the main-thread engine (`cmykExportService`) and every export
 * worker, so both paths always produce identical CMYK samples — important
 * because a worker failure silently falls back to the main thread.
 *
 * COLOUR IS EXACT ON PURPOSE. `FLAGS_NOOPTIMIZE` runs LittleCMS's full
 * per-pixel pipeline, which is what the app shipped before v0.7.7 and what the
 * presses have been calibrated against. The optimised CLUT paths are much
 * faster (measured on the demo card: 149–151 ms → 33–47 ms per card) but they
 * CHANGE the printed values — the default grid moves 52.6 % of samples by up to
 * 8/255 and even the high-res grid moves 36.1 % by up to 6/255. That is a
 * colour-management decision, not a performance one, so it is not taken here.
 *
 * Keep this constant as the single place any future colour decision is made:
 * changing it changes every exported card, in both output paths.
 */
import { FLAGS_NOOPTIMIZE } from '@kittl/little-cms/flags';

/** Flags used for the sRGB→CMYK transform everywhere in the app (exact CMYK) */
export const CMYK_TRANSFORM_FLAGS = FLAGS_NOOPTIMIZE;
