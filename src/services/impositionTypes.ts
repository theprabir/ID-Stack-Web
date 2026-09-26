/**
 * Imposition engine types (Phase 6).
 * A sheet layout describes how card fronts/backs are arranged on a physical
 * paper sheet for print-shop output. Every dimension is user-controlled and
 * stored in one length unit so the maths stays exact.
 */

/** Length units supported by the imposition editor */
export type LengthUnit = 'mm' | 'cm' | 'in' | 'pt';

/** Points per unit — PDF user space is defined in points (1/72 inch) */
const UNIT_TO_PT: Record<LengthUnit, number> = {
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  pt: 1,
};

/** Convert a length in the given unit to PDF points */
export function toPoints(value: number, unit: LengthUnit): number {
  return value * UNIT_TO_PT[unit];
}

/** Preset paper sizes in points (portrait) */
export const PAPER_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  a4: { width: 595.276, height: 841.89, label: 'A4' },
  a3: { width: 841.89, height: 1190.55, label: 'A3' },
  letter: { width: 612, height: 792, label: 'Letter' },
  legal: { width: 612, height: 1008, label: 'Legal' },
  tabloid: { width: 792, height: 1224, label: 'Tabloid (11×17)' },
  custom: { width: 0, height: 0, label: 'Custom' },
};

/** Paper selection: a preset name plus custom dimensions */
export interface PaperSettings {
  /** Preset id (a4/a3/letter/legal/tabloid/custom) */
  preset: keyof typeof PAPER_PRESETS;
  /** Custom paper width (unit units) — used when preset === 'custom' */
  width: number;
  /** Custom paper height (unit units) — used when preset === 'custom' */
  height: number;
  /** Landscape orientation swap for preset sizes */
  landscape: boolean;
}

/** Where sheet numbers are printed */
export type NumberPosition =
  | 'none'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** Numbering options — position, size and colour fully user-controlled */
export interface NumberingSettings {
  /** Numbering mode */
  mode: 'per-sheet' | 'continuous' | 'none';
  /** Position on the sheet (ignored when mode === 'none') */
  position: NumberPosition;
  /** Font size in points */
  fontSize: number;
  /** Text colour as hex (e.g. #333333) */
  color: string;
  /** Optional prefix shown before the number (e.g. "Sheet ") */
  prefix: string;
}

/** Complete imposition configuration */
export interface ImpositionSettings {
  paper: PaperSettings;
  /** Unit used by every user-facing dimension in these settings */
  unit: LengthUnit;
  /** Card trim size width (unit units) — usually the PSD design width */
  cardWidth: number;
  /** Card trim size height (unit units) — usually the PSD design height */
  cardHeight: number;
  /** Bleed extension on every side of each card (unit units, 0 = none) */
  bleed: number;
  /** Gap between neighbouring cards (unit units) */
  gap: number;
  /** Sheet margin on every side (unit units) */
  margin: number;
  /** Draw crop marks at card corners */
  cropMarks: boolean;
  /** Crop mark length (unit units) */
  cropMarkLength: number;
  /** Crop mark offset from the trim edge (unit units) */
  cropMarkOffset: number;
  /** Crop mark stroke colour */
  cropMarkColor: string;
  numbering: NumberingSettings;
  /** Per-slot card numbering: each card shows its sequence number */
  cardNumbers: CardNumberSettings;
  /**
   * Double-sided duplex pairing: when true, back-side sheets are laid out
   * mirrored per row (row order reversed) so long-edge duplex printing puts
   * each back behind its front.
   */
  duplex: boolean;
}

/** Per-card numbering options (printed on every card slot) */
export interface CardNumberSettings {
  /** Show a sequence number on each card slot */
  enabled: boolean;
  /** Corner of the card the number is printed in */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Font size in points */
  fontSize: number;
  /** Text colour as hex */
  color: string;
  /** Margin from the card edges (unit units) */
  margin: number;
  /** Optional prefix (e.g. "#") */
  prefix: string;
  /** Start value (default 1; continuous across sheets) */
  start: number;
}

/** One card slot on a sheet (all values in PDF points) */
export interface CardSlot {
  /** Trim-box left edge in points */
  x: number;
  /** Trim-box top edge in points (PDF y grows downward in our layout math) */
  y: number;
  /** Trim width in points */
  width: number;
  /** Trim height in points */
  height: number;
  /** 1-based column position in the grid */
  column: number;
  /** 1-based row position in the grid */
  row: number;
}

/** Computed sheet geometry: grid dimensions and slot positions (in points) */
export interface SheetLayout {
  /** Page width in points */
  pageWidth: number;
  /** Page height in points */
  pageHeight: number;
  /** Card cells across (columns) */
  columns: number;
  /** Card cells down (rows) */
  rows: number;
  /** Cards per sheet = columns × rows */
  perSheet: number;
  /** Horizontal pitch: bleed*2 + cardWidth + gap (points) */
  pitchX: number;
  /** Vertical pitch: bleed*2 + cardHeight + gap (points) */
  pitchY: number;
  /** Left edge of the first cell's bleed box (points) */
  originX: number;
  /** Top edge of the first cell's bleed box (points) */
  originY: number;
  /** Trim size in points */
  cardWidthPt: number;
  cardHeightPt: number;
  /** Bleed in points */
  bleedPt: number;
  /** Every slot position (trim boxes), row-major */
  slots: CardSlot[];
}

/** Resolve the effective page size in points for paper settings + unit */
export function resolvePageSizePt(paper: PaperSettings, unit: LengthUnit): { width: number; height: number } {
  let widthPt: number;
  let heightPt: number;
  if (paper.preset === 'custom') {
    widthPt = toPoints(paper.width, unit);
    heightPt = toPoints(paper.height, unit);
  } else {
    const preset = PAPER_PRESETS[paper.preset];
    widthPt = preset ? preset.width : 0;
    heightPt = preset ? preset.height : 0;
  }
  if (paper.landscape && widthPt < heightPt) {
    [widthPt, heightPt] = [heightPt, widthPt];
  }
  return { width: widthPt, height: heightPt };
}

/** Default imposition settings (A4, CR80 54×86 mm cards, 3 mm bleed) */
export const DEFAULT_IMPOSITION_SETTINGS: ImpositionSettings = {
  paper: { preset: 'a4', width: 210, height: 297, landscape: false },
  unit: 'mm',
  cardWidth: 86,
  cardHeight: 54,
  bleed: 3,
  gap: 4,
  margin: 8,
  cropMarks: true,
  cropMarkLength: 3,
  cropMarkOffset: 1.5,
  cropMarkColor: '#000000',
  numbering: {
    mode: 'per-sheet',
    position: 'bottom-right',
    fontSize: 8,
    color: '#333333',
    prefix: '',
  },
  cardNumbers: {
    enabled: false,
    position: 'bottom-right',
    fontSize: 6,
    color: '#333333',
    margin: 2,
    prefix: '#',
    start: 1,
  },
  duplex: true,
};

/**
 * Order card canvases for a back sheet so long-edge duplex printing places
 * each back exactly behind its front. Front sheets are filled row-major
 * (left→right, top→bottom); a long-edge-duplex back is ALSO row-major on the
 * sheet, but the printer flips the sheet left-right, so to pair front
 * (row r, col c) with its back we must place the back at the MIRRORED column
 * (cols+1−c) of the same row.
 *
 * @param fronts - Front canvases in row-major slot order
 * @param perSheet - Cards per sheet
 * @param columns - Grid columns
 * @returns Back canvases in row-major slot order (mirrored per row)
 */
export function pairBacksForDuplex(
  fronts: HTMLCanvasElement[],
  perSheet: number,
  columns: number
): HTMLCanvasElement[] {
  const backs: HTMLCanvasElement[] = new Array(fronts.length);
  // Work sheet by sheet: fronts come as one long row-major list across all
  // sheets; mirror the column inside each sheet-sized block. The back list is
  // consumed in the same order the fronts were produced (row-major), so back
  // card #k pairs with front card #k — it is only REPOSITIONED to the
  // mirrored slot on its sheet.
  for (let index = 0; index < fronts.length; index += 1) {
    const sheetBlock = Math.floor(index / perSheet);
    const slotInBlock = index % perSheet;
    const slotRow = Math.floor(slotInBlock / columns);
    const slotCol = slotInBlock % columns;
    const mirroredCol = columns - 1 - slotCol;
    const backSlotInBlock = slotRow * columns + mirroredCol;
    const front = fronts[index];
    if (front) backs[sheetBlock * perSheet + backSlotInBlock] = front;
  }
  return backs;
}

/**
 * Compute the sheet geometry for a card size on a paper size.
 *
 * The layout uses a uniform grid: each cell is (card + 2×bleed) wide/high
 * with `gap` between cells and `margin` around the sheet. The grid is centred
 * on the page when the cells do not fill it exactly.
 *
 * @param settings - Imposition settings (any unit)
 * @param designAspect - Fallback card aspect from the PSD (width/height) used
 *                       when the card trim size was left at 0
 * @returns Geometry in points, or null when nothing fits
 */
export function computeSheetLayout(
  settings: ImpositionSettings,
  designAspect?: { width: number; height: number }
): SheetLayout | null {
  const { width: pageWidth, height: pageHeight } = resolvePageSizePt(settings.paper, settings.unit);
  const unitPt = toPoints(1, settings.unit);

  const cardWidthPt = settings.cardWidth > 0 ? toPoints(settings.cardWidth, settings.unit) : (designAspect ? designAspect.width : 0);
  const cardHeightPt = settings.cardHeight > 0 ? toPoints(settings.cardHeight, settings.unit) : (designAspect ? designAspect.height : 0);
  if (cardWidthPt <= 0 || cardHeightPt <= 0) return null;

  const bleedPt = Math.max(0, settings.bleed) * unitPt;
  const gapPt = Math.max(0, settings.gap) * unitPt;
  const marginPt = Math.max(0, settings.margin) * unitPt;

  const cellWidth = cardWidthPt + 2 * bleedPt;
  const cellHeight = cardHeightPt + 2 * bleedPt;

  const columns = Math.floor((pageWidth - 2 * marginPt + gapPt) / (cellWidth + gapPt));
  const rows = Math.floor((pageHeight - 2 * marginPt + gapPt) / (cellHeight + gapPt));
  if (columns < 1 || rows < 1) return null;

  // Centre the grid on the page.
  const gridWidth = columns * cellWidth + (columns - 1) * gapPt;
  const gridHeight = rows * cellHeight + (rows - 1) * gapPt;
  const originX = (pageWidth - gridWidth) / 2;
  const originY = (pageHeight - gridHeight) / 2;

  const slots: CardSlot[] = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      slots.push({
        x: originX + (column - 1) * (cellWidth + gapPt) + bleedPt,
        y: originY + (row - 1) * (cellHeight + gapPt) + bleedPt,
        width: cardWidthPt,
        height: cardHeightPt,
        column,
        row,
      });
    }
  }

  return {
    pageWidth,
    pageHeight,
    columns,
    rows,
    perSheet: columns * rows,
    pitchX: cellWidth + gapPt,
    pitchY: cellHeight + gapPt,
    originX,
    originY,
    cardWidthPt,
    cardHeightPt,
    bleedPt,
    slots,
  };
}
