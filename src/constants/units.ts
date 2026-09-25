/**
 * Measurement unit conversion constants.
 * The canvas works in millimetres internally (Architecture.md data models).
 */
export const MM_PER_INCH = 25.4;

/** Standard CR80 ID card dimensions in millimetres */
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 54;

/** Sheet sizes in millimetres (portrait) */
export const SHEET_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
} as const;

/** Imposition defaults per Design.md */
export const IMPOSITION_DEFAULTS = {
  marginTop: 10,
  marginBottom: 10,
  marginLeft: 10,
  marginRight: 10,
  gutterHorizontal: 3,
  gutterVertical: 3,
  bleed: 3,
} as const;

/** Zoom limits for the canvas editor */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4.0;
