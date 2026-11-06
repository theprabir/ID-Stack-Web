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

/** Corner of a card where its number is printed */
export type NumberPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * CARD numbering options.
 *
 * These controls print a sequence number on each card — they never print a
 * page/sheet number. Both faces of one record always carry the SAME number,
 * whether they sit above/below each other on one sheet or on separate front
 * and back sheets.
 *
 * - `per-sheet`: every sheet restarts the sequence, so a sheet holding five
 *   cards prints 1–5 (plus `start` − 1). The next sheet prints 1–5 again.
 * - `continuous`: the sequence runs through the whole job, so 1–5 continues at
 *   6 on the next sheet (and across split PDF parts).
 * - `none`: no card numbers are printed.
 */
export interface NumberingSettings {
  /** Card numbering mode */
  mode: 'per-sheet' | 'continuous' | 'none';
  /** Corner of the card the number is printed in */
  position: NumberPosition;
  /** Font size in points */
  fontSize: number;
  /** Text colour as hex (e.g. #333333) */
  color: string;
  /** Margin from the card edges (unit units) */
  margin: number;
  /** Optional prefix shown before the number (e.g. "#") */
  prefix: string;
  /** First number of the sequence (default 1) */
  start: number;
}

/** Card orientation: how the card's width/height map onto the page */
export type CardOrientation = 'portrait' | 'landscape';

/**
 * How fronts and backs are arranged on sheets.
 * - 'interleaved': each front has its own back directly below it on the SAME
 *   sheet (row 1 = fronts, row 2 = the matching backs, …) — one PDF for the
 *   whole job, ideal for cutting and manual backing.
 * - 'separate': all fronts on front sheets, all backs on back sheets.
 *   With duplex pairing on, backs are mirrored per row for long-edge duplex.
 */
export type SheetArrangement = 'interleaved' | 'separate';

/** Complete imposition configuration */
export interface ImpositionSettings {
  paper: PaperSettings;
  /** Unit used by every user-facing dimension in these settings */
  unit: LengthUnit;
  /** Card trim size width (unit units) — usually the PSD design width */
  cardWidth: number;
  /** Card trim size height (unit units) — usually the PSD design height */
  cardHeight: number;
  /**
   * Card direction: portrait keeps the design's width<height as authored,
   * landscape swaps the two so the card is wider than tall. The card is
   * always scaled to fit the box WITHOUT distortion (letterboxed when the
   * design aspect does not match).
   */
  cardOrientation: CardOrientation;
  /**
   * Front/back sheet arrangement (see {@link SheetArrangement}).
   * Defaults to interleaved (each back under its own front).
   */
  arrangement: SheetArrangement;
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
  /**
   * Double-sided duplex pairing: when true, back-side sheets are laid out
   * mirrored per row (row order reversed) so long-edge duplex printing puts
   * each back behind its front.
   */
  duplex: boolean;
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
export function resolvePageSizePt(
  paper: PaperSettings,
  unit: LengthUnit
): { width: number; height: number } {
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
}/**
 * Convert a rendered design's pixel size to the settings' unit at the
 * design's resolution (px ÷ PPI × 72 = pt, then pt → unit).
 */
function designPxToUnit(px: number, dpi: number, unit: LengthUnit): number {
  return (px / dpi) * 72 / toPoints(1, unit);
}

/**
 * Imposition card size derived from an uploaded PSD design.
 *
 * The card trim size ALWAYS comes from the PSD's pixel dimensions and the
 * PSD's declared resolution (PPI): physical size = px ÷ PPI × 72 pt, then
 * converted to the active unit — never the app default, never a raw pixel
 * count. A 300-DPI 1056×663 px card correctly derives to 86×54 mm, not
 * absurd centimetre values. The requested direction only normalises which
 * side is width vs height:
 * - portrait → the card must be taller than wide (a wide design is swapped)
 * - landscape → the card must be wider than tall (a tall design is swapped)
 * Aspect is preserved in both cases.
 *
 * @param designWidthPx - PSD design width in pixels
 * @param designHeightPx - PSD design height in pixels
 * @param direction - Requested card direction
 * @param unit - Active length unit
 * @param dpi - Design resolution in pixels per inch (default 72)
 * @returns Card trim width/height in the given unit (2-decimal rounded)
 */
export function deriveCardSizeFromDesign(
  designWidthPx: number,
  designHeightPx: number,
  direction: CardOrientation,
  unit: LengthUnit,
  dpi = 72
): { width: number; height: number } {
  let widthPt = designPxToUnit(designWidthPx, dpi, unit);
  let heightPt = designPxToUnit(designHeightPx, dpi, unit);
  const isTall = heightPt > widthPt;
  if (
    (direction === 'portrait' && !isTall) ||
    (direction === 'landscape' && isTall)
  ) {
    [widthPt, heightPt] = [heightPt, widthPt];
  }
  return {
    width: Number(widthPt.toFixed(2)),
    height: Number(heightPt.toFixed(2)),
  };
}

/**
 * EXACT physical size of a rendered card, in PDF points — never rounded.
 *
 * This is the value the imposition engine lays sheets out with (v0.7.4):
 * pixel width ÷ DPI × 72 pt. Because the slot geometry and the drawn image are
 * both derived from the same numbers, a card is placed 1:1 — no scaling up, no
 * scaling down, not even the sub-0.1 % drift that the 2-decimal unit-rounded
 * `cardWidth`/`cardHeight` settings introduced.
 *
 * @param widthPx - Rendered card width in pixels
 * @param heightPx - Rendered card height in pixels
 * @param dpi - Resolution of those pixels (default 72)
 * @param direction - Requested card direction (portrait keeps the authored
 *                    orientation, landscape swaps a tall design)
 * @returns Trim size in points (width/height), orientation applied
 */
export function artworkSizePt(
  widthPx: number,
  heightPx: number,
  dpi = 72,
  direction: CardOrientation = 'portrait'
): { width: number; height: number } {
  const safeDpi = dpi > 0 ? dpi : 72;
  let width = (widthPx * 72) / safeDpi;
  let height = (heightPx * 72) / safeDpi;
  if (direction === 'landscape' && width < height) {
    [width, height] = [height, width];
  }
  return { width, height };
}

/**
 * True when the stored card size matches the PSD-derived size for the
 * current direction (within rounding). Used to decide whether persisted
 * settings are stale and should be re-derived from the design.
 *
 * @param settings - Current imposition settings
 * @param designWidthPx - Front PSD width in pixels
 * @param designHeightPx - Front PSD height in pixels
 * @param dpi - Design resolution in pixels per inch (default 72)
 */
export function isCardSizeSyncedWithDesign(
  settings: Pick<ImpositionSettings, 'cardWidth' | 'cardHeight' | 'unit' | 'cardOrientation'>,
  designWidthPx: number,
  designHeightPx: number,
  dpi = 72
): boolean {
  const expected = deriveCardSizeFromDesign(
    designWidthPx,
    designHeightPx,
    settings.cardOrientation,
    settings.unit,
    dpi
  );
  const tolerance = 0.05;
  return (
    Math.abs(settings.cardWidth - expected.width) <= tolerance &&
    Math.abs(settings.cardHeight - expected.height) <= tolerance
  );
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
    mode: 'none',
    position: 'bottom-right',
    fontSize: 8,
    color: '#333333',
    margin: 2,
    prefix: '',
    start: 1,
  },
  cardOrientation: 'portrait',
  arrangement: 'interleaved',
  duplex: true,
};

/**
 * How many RECORDS (front + back pairs) one physical sheet holds.
 *
 * Interleaved jobs with both faces place each record's front on one row and
 * its back on the next, so only half the grid rows hold records. Every other
 * case fills all grid slots with records.
 *
 * @param layout - Computed sheet layout
 * @param arrangement - Front/back arrangement mode
 * @param hasBackFaces - True when back designs are part of this job
 * @returns Records per sheet (never less than 1)
 */
export function recordsPerSheetFor(
  layout: Pick<SheetLayout, 'columns' | 'rows' | 'perSheet'>,
  arrangement: SheetArrangement,
  hasBackFaces: boolean
): number {
  if (arrangement === 'interleaved' && hasBackFaces) {
    return Math.max(1, Math.floor(layout.rows / 2)) * layout.columns;
  }
  return Math.max(1, layout.perSheet);
}

/**
 * Printed card number for one record.
 *
 * Both faces of a record share its index, so they always print the same
 * number — regardless of whether they sit on the same sheet or on separate
 * front/back sheets. `recordIndex` is 0-based over the job.
 *
 * @param settings - Card numbering settings
 * @param recordIndex - 0-based record (front+back pair) index in the job
 * @param recordsPerSheet - Records one sheet holds (see {@link recordsPerSheetFor})
 * @returns Number to print, or null when numbering is off
 */
export function cardNumberFor(
  settings: NumberingSettings,
  recordIndex: number,
  recordsPerSheet: number
): number | null {
  if (settings.mode === 'none') return null;
  const start = Math.max(0, Math.round(settings.start));
  if (settings.mode === 'per-sheet') {
    return start + (recordIndex % Math.max(1, recordsPerSheet));
  }
  return start + recordIndex;
}

/**
 * Map a sheet's slot record indices to the numbers printed in those slots.
 *
 * @param recordIndices - Record index per slot (`null` = empty slot)
 * @param settings - Card numbering settings
 * @param recordsPerSheet - Records one sheet holds
 * @returns Printed number per slot (`null` = no number)
 */
export function cardNumbersForSlots(
  recordIndices: Array<number | null>,
  settings: NumberingSettings,
  recordsPerSheet: number
): Array<number | null> {
  return recordIndices.map((recordIndex) =>
    recordIndex === null ? null : cardNumberFor(settings, recordIndex, recordsPerSheet)
  );
}

/**
 * Order card canvases for a back sheet so long-edge duplex printing places
 * each back exactly behind its front. Front sheets are filled row-major
 * (left→right, top→bottom); a long-edge-duplex back is ALSO row-major on the
 * sheet, but the printer flips the sheet left-right, so to pair front
 * (row r, col c) with its back we must place the back at the MIRRORED column
 * (cols+1−c) of the same row.
 *
 * @param fronts - Front cards (canvases or encoded images) in row-major slot order
 * @param perSheet - Cards per sheet
 * @param columns - Grid columns
 * @returns Back cards in row-major slot order (mirrored per row; entries
 *          may be `null` where no back exists)
 */
export function pairBacksForDuplex<T>(fronts: T[], perSheet: number, columns: number): Array<T | null> {
  const backs: Array<T | null> = new Array(fronts.length).fill(null);
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
 * v0.7.4 — when `exactCardPt` is supplied (the artwork's true physical size
 * from {@link artworkSizePt}) the trim boxes use those EXACT point values and
 * the user-facing `cardWidth`/`cardHeight` numbers are ignored. The rendered
 * image therefore lands on its slot 1:1, with no scaling whatsoever. Bleed
 * enlarges only the reserved cell around the trim box — it never resizes the
 * artwork.
 *
 * @param settings - Imposition settings (any unit)
 * @param designAspect - Fallback card aspect from the PSD (width/height) used
 *                       when the card trim size was left at 0
 * @param exactCardPt - Exact artwork size in points (overrides the settings)
 * @returns Geometry in points, or null when nothing fits
 */
export function computeSheetLayout(
  settings: ImpositionSettings,
  designAspect?: { width: number; height: number },
  exactCardPt?: { width: number; height: number }
): SheetLayout | null {
  const { width: pageWidth, height: pageHeight } = resolvePageSizePt(settings.paper, settings.unit);
  const unitPt = toPoints(1, settings.unit);

  const hasExactSize =
    exactCardPt !== undefined &&
    Number.isFinite(exactCardPt.width) &&
    Number.isFinite(exactCardPt.height) &&
    exactCardPt.width > 0 &&
    exactCardPt.height > 0;

  let cardWidthPt = hasExactSize
    ? exactCardPt.width
    : settings.cardWidth > 0
      ? toPoints(settings.cardWidth, settings.unit)
      : designAspect
        ? designAspect.width
        : 0;
  let cardHeightPt = hasExactSize
    ? exactCardPt.height
    : settings.cardHeight > 0
      ? toPoints(settings.cardHeight, settings.unit)
      : designAspect
        ? designAspect.height
        : 0;
  if (cardWidthPt <= 0 || cardHeightPt <= 0) return null;

  // Card direction: 'landscape' swaps the trim box so the card is wider
  // than tall (the image itself is contain-fitted at render time, so nothing
  // is distorted — see buildSheetsPdf / renderSheetPreview).
  if (settings.cardOrientation === 'landscape' && cardWidthPt < cardHeightPt) {
    [cardWidthPt, cardHeightPt] = [cardHeightPt, cardWidthPt];
  }

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

/** How many physical sheets a job produces, by arrangement */
export interface SheetCounts {
  /** Cards that fit on one sheet (interleaved: front rows × columns) */
  perSheet: number;
  /** Cards (front rows) placed per sheet of an interleaved job */
  frontsPerSheet: number;
  /** Physical sheets in the job */
  total: number;
  /** Sheets holding fronts (separate arrangement) */
  frontSheets: number;
  /** Sheets holding backs (separate arrangement) */
  backSheets: number;
}

/**
 * Count the sheets a job will produce.
 *
 * Shared by generation and the preview so the thumbnail strip can never
 * disagree with the PDF that is actually written.
 *
 * @param layout - Computed sheet layout
 * @param frontCount - Cards (records with a front design)
 * @param backCount - Back cards (records with a back design)
 * @param arrangement - Front/back arrangement mode
 * @returns Sheet counts for the job
 */
export function countJobSheets(
  layout: Pick<SheetLayout, 'columns' | 'rows' | 'perSheet'>,
  frontCount: number,
  backCount: number,
  arrangement: SheetArrangement
): SheetCounts {
  if (arrangement === 'interleaved') {
    // With both faces each record needs a front and a back row; with one face
    // every grid slot holds a record.
    const frontsPerSheet = recordsPerSheetFor(layout, arrangement, backCount > 0);
    return {
      perSheet: frontsPerSheet,
      frontsPerSheet,
      total: Math.ceil(Math.max(frontCount, backCount) / frontsPerSheet),
      frontSheets: Math.ceil(frontCount / frontsPerSheet),
      backSheets: 0,
    };
  }
  const frontSheets = Math.ceil(frontCount / layout.perSheet);
  const backSheets = Math.ceil(backCount / layout.perSheet);
  return {
    perSheet: layout.perSheet,
    frontsPerSheet: layout.perSheet,
    total: frontSheets + backSheets,
    frontSheets,
    backSheets,
  };
}

/**
 * Build the per-sheet card lists for a job.
 *
 * - `interleaved`: one list. Front k is placed at even row slots, its own
 *   back directly below it in the row underneath, so after cutting each
 *   stack keeps front and back together (row 1 = Front1 Front2 …, row 2 =
 *   Back1 Back2 …, row 3 = Front3 Front4 …, …).
 *
 * IMPORTANT: slot positions are preserved — the returned arrays keep a
 * `null` entry for every empty slot, so consumers (PDF + preview) place each
 * canvas in its true grid cell. Never compact/filter these lists.
 * - `separate`: two lists — fronts fill front sheets row-major; backs fill
 *   back sheets row-major (mirrored per row when duplex pairing is on for
 *   long-edge duplex printing).
 *
 * Only rows that actually exist on a sheet are produced (a partial last
 * row of fronts still gets its backs below it).
 *
 * @param fronts - Front canvases in row order
 * @param backs - Back canvases in the same row order (may be empty)
 * @param layout - Computed sheet layout (columns/rows/perSheet)
 * @param arrangement - Front/back arrangement mode
 * @param duplex - Mirror back columns for long-edge duplex (separate mode)
 * @returns One canvas list per output sheet, in output order. Entries may be
 *          `null` (= empty slot); the list length always equals the slot
 *          count so indices stay true grid positions.
 */
export function arrangeSheets<T>(
  fronts: T[],
  backs: T[],
  layout: { columns: number; rows: number; perSheet: number },
  arrangement: SheetArrangement,
  duplex: boolean
): Array<Array<T | null>> {
  if (arrangement === 'separate') {
    const sheets: Array<Array<T | null>> = [];
    for (let i = 0; i < fronts.length; i += layout.perSheet) {
      sheets.push(fronts.slice(i, i + layout.perSheet));
    }
    const backList: Array<T | null> = duplex
      ? pairBacksForDuplex(backs, layout.perSheet, layout.columns)
      : backs;
    for (let i = 0; i < backList.length; i += layout.perSheet) {
      sheets.push(backList.slice(i, i + layout.perSheet));
    }
    return sheets;
  }

  // Interleaved: fill row-major slots but pair rows — front row r is placed
  // on grid rows 2r and 2r+1 of the sheet. Only whole front rows are placed
  // (a sheet always has its backs directly below the fronts). With no back
  // faces there is nothing to pair, so records fill every grid slot (matching
  // the streamed PDF writer, which does the same).
  const { columns, rows, perSheet } = layout;
  const paired = backs.length > 0;
  const frontRowsPerSheet = paired ? Math.max(1, Math.floor(rows / 2)) : rows;
  const frontsPerSheet = frontRowsPerSheet * columns;
  const sheets: Array<Array<T | null>> = [];
  for (let start = 0; start < fronts.length; start += frontsPerSheet) {
    const sheetFronts = fronts.slice(start, start + frontsPerSheet);
    const sheetBacks = backs.slice(start, start + frontsPerSheet);
    // Keep nulls: each entry must stay at its true row-major grid position
    // (filtering would slide later cards into the wrong slots).
    const placed: (T | null)[] = new Array(perSheet).fill(null);
    const rowStride = paired ? 2 : 1;
    for (let index = 0; index < sheetFronts.length; index += 1) {
      const frontRow = Math.floor(index / columns);
      const col = index % columns;
      placed[frontRow * rowStride * columns + col] = sheetFronts[index] ?? null;
      // `!= null` (not truthiness): consumers also arrange record indices,
      // and record 0 is a valid background card, not an empty slot.
      const back = sheetBacks[index];
      if (paired && back !== null && back !== undefined) {
        placed[(frontRow * 2 + 1) * columns + col] = back;
      }
    }
    sheets.push(placed);
  }
  return sheets;
}
