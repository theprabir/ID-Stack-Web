/**
 * Imposition service (Phase 6).
 *
 * Turns rendered card canvases into print-shop output:
 * - Imposed sheets: N cards per physical page with bleed, crop marks and
 *   user-positioned numbering, assembled as a CMYK PDF (pdf-lib).
 * - A preview canvas renderer that mirrors the PDF layout exactly.
 *
 * All geometry flows through `computeSheetLayout` (impositionTypes.ts) so the
 * preview and the PDF can never diverge. Each PDF page gets exactly one
 * content stream (card placements + crop marks + numbering) and one shared
 * Resources dictionary referencing every image XObject on that page.
 *
 * CARD SIZE (v0.7.4): a card is NEVER scaled. Its printed size is its own
 * physical size — pixel width ÷ design DPI × 72 pt — placed centred on its
 * trim slot. The bleed setting only reserves spacing around the trim box;
 * the artwork is not enlarged into it. Crop marks now sit on the TRIM edges
 * (offset outwards by the configured mark offset), so they mark the actual
 * cut line instead of the bleed box.
 *
 * MEMORY (v0.7.4): sheets are written through `createImposedPdfBuilder`,
 * one page at a time. Callers can therefore discard each sheet's canvases
 * as soon as the page is encoded (batchService does exactly that), instead
 * of holding every rendered card for a 600-record job in memory. Card
 * images are embedded as 4-component Adobe CMYK JPEGs (DCTDecode) — the
 * same ICC sRGB→CMYK transform and Adobe APP14 marker used by the ZIP
 * export — which keeps a 600-card imposed PDF in the hundreds of MB rather
 * than the gigabytes a raw Flate CMYK stream would need.
 */
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  PDFFont,
  StandardFonts,
  type PDFRef,
} from 'pdf-lib';
import type { CardSlot, ImpositionSettings, SheetLayout } from './impositionTypes';
import {
  cardNumbersForSlots,
  computeSheetLayout,
  arrangeSheets,
  recordsPerSheetFor,
  toPoints,
} from './impositionTypes';
import { initCmykEngine, encodeCmykJpeg } from './cmykExportService';
import { listLoadedFontFamilies, getFontRecord } from './fontService';
import cmykProfileUrl from '@/assets/profiles/default_cmyk.icc?url';

/** The producer string written into exported PDF documents */
const PDF_PRODUCER = 'ID Stack v0.7.4';

/** Default JPEG quality for card images embedded in imposed sheets */
const DEFAULT_SHEET_QUALITY = 0.92;

/** Safe-area inset drawn by the proof overlay (millimetres) */
const PROOF_SAFE_AREA_MM = 3;

/** Cached bundled CMYK ICC profile bytes */
let profileCache: Uint8Array | null = null;

/** Fetch and cache the bundled CMYK ICC profile */
async function getCmykProfileBytes(): Promise<Uint8Array> {
  if (profileCache) return profileCache;
  const response = await fetch(cmykProfileUrl);
  profileCache = new Uint8Array(await response.arrayBuffer());
  return profileCache;
}

/** Encode a JS string as a Latin-1 Uint8Array (PDF content streams are ASCII) */
function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** Per-document cache of embedded fonts, keyed by normalised family */
const embeddedFonts = new WeakMap<PDFDocument, Map<string, PDFFont>>();

/**
 * Get a PDFFont for a family, embedding the raw uploaded .ttf/.otf buffer
 * when a registered font matches (so custom/legacy glyphs survive in the
 * exported PDF instead of reverting to a standard font), falling back to
 * Helvetica otherwise. Embedded fonts are cached per PDF document.
 */
async function getPDFFont(pdf: PDFDocument, family: string): Promise<PDFFont> {
  const key = normaliseFontName(family);
  let cache = embeddedFonts.get(pdf);
  if (!cache) {
    cache = new Map<string, PDFFont>();
    embeddedFonts.set(pdf, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;

  let embedded: PDFFont | undefined;
  const familyMatch = listLoadedFontFamilies().find(
    (name) => normaliseFontName(name) === key
  );
  if (familyMatch) {
    const record = getFontRecord(familyMatch);
    if (record) {
      try {
        embedded = await pdf.embedFont(new Uint8Array(record.buffer));
      } catch {
        embedded = undefined; // Unsupported/invalid binary — fall back below.
      }
    }
  }
  const result = embedded ?? (await pdf.embedFont(StandardFonts.Helvetica));
  cache.set(key, result);
  return result;
}

/** Normalise a font name for comparison */
function normaliseFontName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]/g, '');
}

/** Parse a hex colour ("#rrggbb" or "#rgb") into 0–1 RGB components */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const expanded = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const value = parseInt(expanded, 16);
  if (Number.isNaN(value) || expanded.length !== 6) return [0, 0, 0];
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** Escape a string for safe inclusion in a PDF literal text operator */
function escapePdfText(text: string): string {
  return text.replace(/([()\\])/g, '\\$1');
}

/** Points-per-unit factor for the given unit */
function unitToPtFactor(unit: ImpositionSettings['unit']): number {
  if (unit === 'mm') return 72 / 25.4;
  if (unit === 'cm') return 72 / 2.54;
  if (unit === 'in') return 72;
  return 1;
}

/** A card image already encoded for embedding (avoids holding the canvas) */
export interface EncodedCard {
  /** Adobe CMYK JPEG bytes */
  bytes: Uint8Array;
  /** Pixel width of the source canvas */
  width: number;
  /** Pixel height of the source canvas */
  height: number;
}

/** A per-slot source: a live canvas, a pre-encoded card, or an empty slot */
export type SheetCardSource = HTMLCanvasElement | EncodedCard | null;

/** Options shared by the PDF builder and the preview renderer */
export interface SheetPdfOptions {
  /**
   * Design resolution (pixels per inch) of the supplied canvases. Used to
   * derive the card's true physical size when {@link cardSizePt} is absent.
   */
  dpi?: number;
  /**
   * EXACT trim size of one card in PDF points (v0.7.4).
   *
   * When supplied (callers derive it with `artworkSizePt(px, px, dpi)`), the
   * sheet layout is built from this value instead of the rounded
   * `cardWidth`/`cardHeight` settings, so every card is placed at exactly
   * 1:1 — the artwork is never scaled up or down, not even by a fraction of a
   * percent. Bleed only expands the reserved cell around the trim box; it
   * never resizes the image and nothing is painted into that band.
   */
  cardSizePt?: { width: number; height: number };
  /** JPEG quality 0–1 for embedded card images (default 0.92) */
  quality?: number;
}

/** Options for the imposed-sheet preview renderer */
export interface SheetPreviewOptions extends SheetPdfOptions {
  /**
   * Draw the trim line and the 3 mm safe-area guide (proof mode). Preview
   * only — the exported PDF never contains these guides.
   */
  proof?: boolean;
  /**
   * Printed card number per slot on THIS page (index = grid slot). Callers
   * derive it from the record index with `cardNumbersForSlots`, so the preview
   * shows exactly the numbers the PDF prints — including the same number on a
   * record's front and back.
   */
  cardNumbers?: Array<number | null>;
}

/**
 * Compute where a card image goes on the page (PDF points, y-up).
 *
 * The image is placed at its own physical size and centred on the trim slot —
 * deliberately NOT fitted to the slot: an earlier build contain-fitted every
 * card to the bleed box (a 3 mm bleed scaled an 86 mm card to 92 mm, i.e. 7 %
 * too large, cropping the design's edges).
 *
 * When `exactCardPt` is supplied the placement IS the trim slot: the layout was
 * computed from the same exact numbers, so the scale factor is precisely 1.000
 * in both axes.
 *
 * @param card - Image pixel dimensions
 * @param slot - Trim box for this card (PDF points, y down from page top)
 * @param pageHeight - Page height in points
 * @param dpi - Design resolution (px per inch); omitted → 1 px = 1 pt
 * @param exactCardPt - Exact artwork trim size in points (layout was built
 *                      from it) → placement is the slot, unscaled
 * @returns Placement rectangle in PDF coordinates (y-up)
 */
export function cardPlacementPt(
  card: { width: number; height: number },
  slot: CardSlot,
  pageHeight: number,
  dpi?: number,
  exactCardPt?: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  if (
    exactCardPt &&
    Number.isFinite(exactCardPt.width) &&
    Number.isFinite(exactCardPt.height) &&
    exactCardPt.width > 0 &&
    exactCardPt.height > 0
  ) {
    return {
      x: slot.x,
      y: pageHeight - (slot.y + slot.height),
      width: slot.width,
      height: slot.height,
    };
  }
  const naturalWidth = dpi && dpi > 0 ? (card.width * 72) / dpi : slot.width;
  const naturalHeight = dpi && dpi > 0 ? (card.height * 72) / dpi : slot.height;
  return {
    x: slot.x + (slot.width - naturalWidth) / 2,
    y: pageHeight - (slot.y + slot.height) + (slot.height - naturalHeight) / 2,
    width: naturalWidth,
    height: naturalHeight,
  };
}

/** Format a point value for a PDF content stream without losing precision */
function pdfNum(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  return String(rounded);
}

/** True when a source is an already-encoded card */
function isEncodedCard(source: SheetCardSource): source is EncodedCard {
  return source !== null && 'bytes' in source;
}

/**
 * Encode a card canvas for sheet embedding (CMYK JPEG). Exported so callers
 * that must buffer cards (e.g. back faces of a separate-sheets job) can hold
 * the compressed bytes instead of a multi-megabyte canvas.
 *
 * @param canvas - Rendered card canvas
 * @param quality - JPEG quality 0–1
 * @returns Encoded card (JPEG bytes + pixel size)
 */
export async function encodeCardForSheet(
  canvas: HTMLCanvasElement,
  quality = DEFAULT_SHEET_QUALITY
): Promise<EncodedCard> {
  const bytes = await encodeCmykJpeg(canvas, quality);
  return { bytes, width: canvas.width, height: canvas.height };
}

/** Free a canvas's backing store as soon as its pixels have been encoded */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // Detached/frozen canvas — nothing to release.
  }
}

/** Incremental imposed-PDF writer: one page per sheet, appended as it arrives */
export interface ImposedPdfBuilder {
  /** Number of pages written so far */
  readonly pageCount: number;
  /**
   * Encode cards and append one sheet page (row-major slot order).
   *
   * @param cards - Card sources per grid slot (`null` = empty slot)
   * @param cardNumbers - Optional printed number per grid slot. The values
   *                      come from the caller (record-based), so a record's
   *                      front and back print the same number and per-sheet
   *                      mode restarts on every page.
   */
  addSheet: (
    cards: SheetCardSource[],
    cardNumbers?: Array<number | null>
  ) => Promise<void>;
  /** Write the document-level OutputIntent and serialise the PDF */
  finish: () => Promise<Uint8Array>;
}

/**
 * Create a streaming imposed-PDF builder.
 *
 * The layout, ICC colour space and numbering font are prepared once; each
 * `addSheet` call encodes only that sheet's cards, appends a page and returns.
 * Nothing from earlier sheets is retained, so peak memory is one sheet's
 * worth of card images plus the compressed PDF being assembled.
 *
 * @param settings - Imposition settings (paper, bleed, gap, marks, numbering)
 * @param options - Design DPI and card image quality
 * @returns Streaming builder
 * @throws Error when the cards cannot fit the selected paper
 */
export async function createImposedPdfBuilder(
  settings: ImpositionSettings,
  options: SheetPdfOptions = {}
): Promise<ImposedPdfBuilder> {
  // EXACT geometry: the sheet is laid out from the artwork's true trim size
  // (px ÷ DPI), never from the rounded unit settings — see artworkSizePt.
  const computed = computeSheetLayout(settings, undefined, options.cardSizePt);
  if (!computed) {
    throw new Error(
      'The cards do not fit on the selected paper size. Reduce the card size, bleed, gap or margin.'
    );
  }
  // Non-null alias: the page writer below is a closure, which TypeScript will
  // not narrow from the guard above.
  const layout: SheetLayout = computed;

  await initCmykEngine();
  const profileBytes = await getCmykProfileBytes();

  const pdf = await PDFDocument.create();
  pdf.setProducer(PDF_PRODUCER);
  pdf.setCreator('ID Stack');

  // Shared ICCBased colour space [/ICCBased <profile stream, N=4>]
  const profileStream = PDFRawStream.of(
    pdf.context.obj({ N: PDFNumber.of(4), Length: PDFNumber.of(profileBytes.length) }),
    profileBytes
  );
  const profileRef = pdf.context.register(profileStream);
  const iccBased = pdf.context.obj([PDFName.of('ICCBased'), profileRef]);

  const numberFont: PDFFont = await getPDFFont(pdf, '__NumberFont');
  const numbering = settings.numbering;
  const numberRgb = hexToRgb(numbering.color);
  const markRgb = hexToRgb(settings.cropMarkColor);
  const markLengthPt = settings.cropMarkLength * unitToPtFactor(settings.unit);
  const markOffsetPt = settings.cropMarkOffset * unitToPtFactor(settings.unit);
  const cardUnitPt = unitToPtFactor(settings.unit);
  const quality = options.quality ?? DEFAULT_SHEET_QUALITY;

  let sheetIndex = 0;

  /** Append one page from already-encoded cards */
  async function writePage(
    cards: SheetCardSource[],
    cardNumbers?: Array<number | null>
  ): Promise<void> {
    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    // (layout is non-null via the alias above)
    const contentLines: string[] = [];
    const imageRefs: Record<string, PDFRef> = {};

    for (
      let slotIndex = 0;
      slotIndex < Math.min(cards.length, layout.slots.length);
      slotIndex += 1
    ) {
      const slot = layout.slots[slotIndex];
      const source = cards[slotIndex];
      if (!slot || !source) continue;

      const card: EncodedCard = isEncodedCard(source)
        ? source
        : await encodeCardForSheet(source, quality);

      const imageStream = PDFRawStream.of(
        pdf.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: PDFNumber.of(card.width),
          Height: PDFNumber.of(card.height),
          ColorSpace: iccBased,
          BitsPerComponent: PDFNumber.of(8),
          Filter: PDFName.of('DCTDecode'),
          // Adobe CMYK JPEGs store inverted samples (255 − ink). PDF reads the
          // stored values as device ink, so without this the whole card prints
          // as a negative (white → black, purple → green). Invert back.
          Decode: pdf.context.obj([1, 0, 1, 0, 1, 0, 1, 0]),
        }),
        card.bytes
      );
      const imageRef = pdf.context.register(imageStream);
      const imageName = `Im${sheetIndex}_${slotIndex}`;
      imageRefs[imageName] = imageRef;

      // Exact-size placement: 1.000× on both axes, on the trim slot.
      const placement = cardPlacementPt(
        card,
        slot,
        layout.pageHeight,
        options.dpi,
        options.cardSizePt
      );
      contentLines.push(
        `q ${pdfNum(placement.width)} 0 0 ${pdfNum(placement.height)} ${pdfNum(placement.x)} ${pdfNum(placement.y)} cm /${imageName} Do Q`
      );

      // --- Card number (record-based value supplied by the caller) ---
      const cardNumber = cardNumbers?.[slotIndex];
      if (numbering.mode !== 'none' && cardNumber !== null && cardNumber !== undefined) {
        const label = `${numbering.prefix}${cardNumber}`;
        const size = numbering.fontSize;
        const textWidth = numberFont.widthOfTextAtSize(label, size);
        const marginPt = Math.max(0, numbering.margin) * cardUnitPt;
        // Trim-box corners in PDF coordinates (y up).
        const trimLeft = slot.x;
        const trimRight = slot.x + slot.width;
        const trimTop = layout.pageHeight - slot.y;
        const trimBottom = layout.pageHeight - (slot.y + slot.height);
        let numX: number;
        let numBaseline: number;
        if (numbering.position.endsWith('left')) numX = trimLeft + marginPt;
        else numX = trimRight - marginPt - textWidth;
        if (numbering.position.startsWith('top')) numBaseline = trimTop - marginPt - size;
        else numBaseline = trimBottom + marginPt;
        contentLines.push(
          `BT ${numberRgb[0].toFixed(3)} ${numberRgb[1].toFixed(3)} ${numberRgb[2].toFixed(3)} rg /__NumberFont ${size} Tf ${numX.toFixed(2)} ${numBaseline.toFixed(2)} Td (${escapePdfText(label)}) Tj ET`
        );
      }

      // --- Crop marks, aligned to the TRIM box (the actual cut line) ---
      if (settings.cropMarks) {
        const left = slot.x;
        const right = slot.x + slot.width;
        const top = layout.pageHeight - slot.y;
        const bottom = layout.pageHeight - (slot.y + slot.height);
        const w = Math.max(0.25, markLengthPt * 0.07).toFixed(2);
        contentLines.push(
          `${markRgb[0].toFixed(3)} ${markRgb[1].toFixed(3)} ${markRgb[2].toFixed(3)} RG ${w} w`
        );
        const marks: [number, number, number, number][] = [
          [left - markOffsetPt - markLengthPt, top, left - markOffsetPt, top],
          [left, top + markOffsetPt, left, top + markOffsetPt + markLengthPt],
          [right + markOffsetPt, top, right + markOffsetPt + markLengthPt, top],
          [right, top + markOffsetPt, right, top + markOffsetPt + markLengthPt],
          [left - markOffsetPt - markLengthPt, bottom, left - markOffsetPt, bottom],
          [left, bottom - markOffsetPt - markLengthPt, left, bottom - markOffsetPt],
          [right + markOffsetPt, bottom, right + markOffsetPt + markLengthPt, bottom],
          [right, bottom - markOffsetPt - markLengthPt, right, bottom - markOffsetPt],
        ];
        for (const [x1, y1, x2, y2] of marks) {
          contentLines.push(
            `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
          );
        }
      }

    }

    // Text is drawn via the content stream (BT/Tf/Td/Tj/ET) to keep the
    // single-content-stream invariant. The font lives ONLY in the /Font dict
    // below — registering it in XObject too is invalid PDF (viewers may drop
    // the text) and was the cause of "missing numbering" in exported PDFs.

    // --- One content stream + one Resources dict per page ---
    const contentStream = pdf.context.flateStream(latin1(contentLines.join('\n')), {});
    const contentRef = pdf.context.register(contentStream);
    const resources = pdf.context.obj({
      XObject: pdf.context.obj(imageRefs),
      Font: pdf.context.obj({ __NumberFont: (numberFont as unknown as { ref: PDFRef }).ref }),
    });
    const resourcesRef = pdf.context.register(resources);
    page.node.set(PDFName.of('Resources'), resourcesRef);
    page.node.set(PDFName.of('Contents'), contentRef);
    sheetIndex += 1;
  }

  return {
    get pageCount() {
      return sheetIndex;
    },
    addSheet: writePage,
    async finish(): Promise<Uint8Array> {
      // GTS_PDFX OutputIntent so print workflows recognise the CMYK target.
      const outputIntent = pdf.context.obj({
        Type: 'OutputIntent',
        S: PDFName.of('GTS_PDFX'),
        OutputConditionIdentifier: PDFString.of('CUSTOM_CMYK'),
        RegistryName: PDFString.of('http://www.color.org'),
        Info: PDFString.of('ID Stack imposed CMYK output (generic CMYK)'),
        DestOutputProfile: profileRef,
      });
      const outputIntentRef = pdf.context.register(outputIntent);
      pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntentRef]));
      return pdf.save({ useObjectStreams: false });
    },
  };
}

/**
 * Build a multi-sheet imposed CMYK PDF from fully rendered sheets.
 *
 * Thin wrapper over {@link createImposedPdfBuilder} kept for callers (and
 * tests) that already hold every sheet's canvases.
 *
 * @param sheets - One array of card canvases per sheet (row-major slot order;
 *                 missing/empty slots are `null` so each canvas stays at its
 *                 true grid position). Use `arrangeSheets` to produce
 *                 interleaved (front + back below) or separate lists.
 * @param settings - Full imposition settings (paper, bleed, gap, margin,
 *                   crop marks, numbering — all user-controlled)
 * @param options - Design DPI (exact card size) and image quality
 * @param cardNumbersPerSheet - Optional printed card number per slot, one
 *                              array per sheet (see `cardNumbersForSlots`).
 *                              Both faces of a record pass the same value.
 * @returns PDF file bytes
 * @throws Error when the cards cannot fit the selected paper
 */
export async function buildSheetsPdf(
  sheets: Array<Array<HTMLCanvasElement | null>>,
  settings: ImpositionSettings,
  options: SheetPdfOptions = {},
  cardNumbersPerSheet?: Array<Array<number | null>>
): Promise<Uint8Array> {
  const builder = await createImposedPdfBuilder(settings, options);
  for (let index = 0; index < sheets.length; index += 1) {
    await builder.addSheet(sheets[index]!, cardNumbersPerSheet?.[index]);
  }
  return builder.finish();
}

/**
 * Build one imposed sheet as a single-page CMYK PDF.
 *
 * @param cardCanvases - Rendered card images for this sheet (row-major)
 * @param settings - Imposition settings
 * @param options - Design DPI (exact card size) and image quality
 * @param cardNumbers - Optional printed card number per slot
 * @returns PDF bytes
 */
export async function buildSheetPdf(
  cardCanvases: Array<HTMLCanvasElement | null>,
  settings: ImpositionSettings,
  options: SheetPdfOptions = {},
  cardNumbers?: Array<number | null>
): Promise<Uint8Array> {
  return buildSheetsPdf([cardCanvases], settings, options, cardNumbers ? [cardNumbers] : undefined);
}

/**
 * Render a preview of one imposed sheet onto a canvas (mirrors the PDF layout
 * produced by `buildSheetsPdf`, including exact-size card placement).
 *
 * @param sheet - Card canvases for this sheet in row-major slot order
 *                (entries may be `null` for empty slots)
 * @param settings - Imposition settings
 * @param maxWidthPx - Preview pixel width (canvas is scaled to fit)
 * @param options - Exact card size, per-slot card numbers + proof guides
 * @returns Preview canvas, or null when the layout does not fit
 */
export function renderSheetPreview(
  sheet: Array<HTMLCanvasElement | null>,
  settings: ImpositionSettings,
  maxWidthPx = 560,
  options: SheetPreviewOptions = {}
): HTMLCanvasElement | null {
  const layout = computeSheetLayout(settings, undefined, options.cardSizePt);
  if (!layout) return null;

  const scale = maxWidthPx / layout.pageWidth;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(layout.pageWidth * scale));
  canvas.height = Math.max(1, Math.round(layout.pageHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;

  // Paper background.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const markLengthPt = settings.cropMarkLength * unitToPtFactor(settings.unit);
  const markOffsetPt = settings.cropMarkOffset * unitToPtFactor(settings.unit);
  const numbering = settings.numbering;
  const proof = options.proof === true;
  const safeAreaPt = toPoints(PROOF_SAFE_AREA_MM, 'mm');
  const trimScale = (slot: CardSlot): { x: number; y: number; w: number; h: number } => ({
    x: slot.x * scale,
    y: slot.y * scale,
    w: slot.width * scale,
    h: slot.height * scale,
  });

  for (let index = 0; index < layout.slots.length; index += 1) {
    const slot = layout.slots[index];
    if (!slot) continue;
    const cardCanvas = sheet[index];

    const cellLeft = (slot.x - layout.bleedPt) * scale;
    const cellTop = (slot.y - layout.bleedPt) * scale;
    const cellWidth = (slot.width + 2 * layout.bleedPt) * scale;
    const cellHeight = (slot.height + 2 * layout.bleedPt) * scale;
    const trim = trimScale(slot);

    if (cardCanvas) {
      // EXACT placement (the same rule as the PDF): the trim box IS the card,
      // so the only scale factor is the preview's page-to-pixel factor.
      context.drawImage(cardCanvas, trim.x, trim.y, trim.w, trim.h);

      // PREVIEW ONLY: the blue trim outline marks the cut line. Neither it nor
      // any overlay is ever drawn into the exported PDF (see
      // createImposedPdfBuilder, which emits images, crop marks and numbering
      // only). The bleed band is not exported or previewed — the canvas and
      // the PDF show the card at trim size, exactly what the guillotine keeps.
      context.strokeStyle = 'rgba(59, 130, 246, 0.85)';
      context.lineWidth = 1;
      context.strokeRect(trim.x, trim.y, trim.w, trim.h);

      if (proof) {

        // Safe area (3 mm inside the trim): nothing important should cross it.
        const inset = safeAreaPt * scale;
        if (trim.w > inset * 2 && trim.h > inset * 2) {
          context.strokeStyle = 'rgba(217, 70, 239, 0.9)';
          context.setLineDash([4, 3]);
          context.strokeRect(trim.x + inset, trim.y + inset, trim.w - inset * 2, trim.h - inset * 2);
          context.setLineDash([]);
        }
      }

      // Card number (mirrors the PDF placement). The value is record-based and
      // supplied by the caller, so fronts and backs show the same number.
      const cardNumber = options.cardNumbers?.[index];
      if (numbering.mode !== 'none' && cardNumber !== null && cardNumber !== undefined) {
        const label = `${numbering.prefix}${cardNumber}`;
        const size = numbering.fontSize;
        const marginPt = Math.max(0, numbering.margin) * unitToPtFactor(settings.unit);
        context.font = `${size}px Helvetica, Arial, sans-serif`;
        context.fillStyle = numbering.color;
        const metrics = context.measureText(label);
        const numLeft = numbering.position.endsWith('left')
          ? slot.x + marginPt
          : slot.x + slot.width - marginPt - metrics.width;
        const numTop = numbering.position.startsWith('top')
          ? slot.y + marginPt
          : slot.y + slot.height - marginPt - size;
        context.fillText(label, numLeft * scale, (numTop + size) * scale);
      }
    } else {
      // Empty slot: dashed outline.
      context.strokeStyle = '#d1d5db';
      context.setLineDash([3, 3]);
      context.strokeRect(cellLeft, cellTop, cellWidth, cellHeight);
      context.setLineDash([]);
    }

    // Crop marks (trim-aligned; same geometry as the PDF content stream).
    if (settings.cropMarks) {
      context.strokeStyle = settings.cropMarkColor;
      context.lineWidth = Math.max(0.5, markLengthPt * scale * 0.07);
      const left = trim.x;
      const right = trim.x + trim.w;
      const top = trim.y;
      const bottom = trim.y + trim.h;
      const offset = markOffsetPt * scale;
      const length = markLengthPt * scale;
      const marks: [number, number, number, number][] = [
        [left - offset - length, top, left - offset, top],
        [left, top - offset, left, top - offset - length],
        [right + offset, top, right + offset + length, top],
        [right, top - offset, right, top - offset - length],
        [left - offset - length, bottom, left - offset, bottom],
        [left, bottom + offset, left, bottom + offset + length],
        [right + offset, bottom, right + offset + length, bottom],
        [right, bottom + offset, right, bottom + offset + length],
      ];
      for (const [x1, y1, x2, y2] of marks) {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      }
    }
  }

  return canvas;
}

/**
 * Render a live preview of the first sheet for a whole job.
 *
 * Takes the job's front/back canvases, arranges them per the current
 * settings (`arrangeSheets` — interleaved fronts+backs or separate sheets)
 * and renders the first resulting sheet with real card images.
 *
 * @param fronts - Front canvases (any count; missing slots stay empty)
 * @param backs - Back canvases (same order as fronts; may be empty)
 * @param settings - Imposition settings
 * @param maxWidthPx - Preview pixel width
 * @param options - Design DPI + proof overlay
 * @returns Preview canvas, or null when the layout does not fit
 */
export function renderJobPreview(
  fronts: HTMLCanvasElement[],
  backs: HTMLCanvasElement[],
  settings: ImpositionSettings,
  maxWidthPx = 560,
  options: SheetPreviewOptions = {}
): HTMLCanvasElement | null {
  const layout = computeSheetLayout(settings, undefined, options.cardSizePt);
  if (!layout) return null;
  const sheets = arrangeSheets(fronts, backs, layout, settings.arrangement, settings.duplex);
  if (sheets.length === 0) return null;
  // Record indices are arranged exactly like the cards, so each slot knows
  // which record it holds — a front and its back then print the same number.
  const recordIndices = fronts.map((_, index) => index);
  const indexSheets = arrangeSheets(
    recordIndices,
    backs.length > 0 ? recordIndices : [],
    layout,
    settings.arrangement,
    settings.duplex
  );
  const perSheetRecords = recordsPerSheetFor(
    layout,
    settings.arrangement,
    backs.length > 0
  );
  const cardNumbers = cardNumbersForSlots(
    indexSheets[0] ?? [],
    settings.numbering,
    perSheetRecords
  );
  return renderSheetPreview(sheets[0]!, settings, maxWidthPx, { ...options, cardNumbers });
}

export { computeSheetLayout, arrangeSheets };
export type { ImpositionSettings, SheetLayout };
