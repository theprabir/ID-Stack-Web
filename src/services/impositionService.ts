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
import type { ImpositionSettings, SheetLayout } from './impositionTypes';
import { computeSheetLayout } from './impositionTypes';
import { initCmykEngine, canvasToCmykBytes } from './cmykExportService';
import cmykProfileUrl from '@/assets/profiles/default_cmyk.icc?url';

/** The producer string written into exported PDF documents */
const PDF_PRODUCER = 'ID Stack v0.5.0';

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

/**
 * Build a multi-sheet imposed CMYK PDF.
 *
 * @param sheets - One array of card canvases per sheet (row-major slot order;
 *                 missing slots are left empty)
 * @param settings - Full imposition settings (paper, bleed, gap, margin,
 *                   crop marks, numbering — all user-controlled)
 * @param firstSheetNumber - Sheet number shown on the first page
 * @param startCardNumber - First number for continuous card numbering
 * @returns PDF file bytes
 * @throws Error when the cards cannot fit the selected paper
 */
export async function buildSheetsPdf(
  sheets: HTMLCanvasElement[][],
  settings: ImpositionSettings,
  firstSheetNumber = 1,
  startCardNumber = 1
): Promise<Uint8Array> {
  const layout = computeSheetLayout(settings);
  if (!layout) throw new Error('The cards do not fit on the selected paper size. Reduce the card size, bleed, gap or margin.');

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

  const numberFont: PDFFont = await pdf.embedFont(StandardFonts.Helvetica);
  const [nr, ng, nb] = hexToRgb(settings.numbering.color);
  const cardNumRgb = hexToRgb(settings.cardNumbers?.color ?? '#000000');
  const markRgb = hexToRgb(settings.cropMarkColor);
  const markLengthPt = settings.cropMarkLength * unitToPtFactor(settings.unit);
  const markOffsetPt = settings.cropMarkOffset * unitToPtFactor(settings.unit);

  let cardCounter = startCardNumber;
  const cardNum = settings.cardNumbers;
  const cardNumEnabled = cardNum?.enabled === true;
  const cardUnitPt = unitToPtFactor(settings.unit);

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    const canvases = sheets[sheetIndex] ?? [];
    const contentLines: string[] = [];
    const imageRefs: Record<string, PDFRef> = {};

    // --- Card placements (one image XObject per occupied slot) ---
    for (let slotIndex = 0; slotIndex < Math.min(canvases.length, layout.slots.length); slotIndex += 1) {
      const slot = layout.slots[slotIndex];
      const canvas = canvases[slotIndex];
      if (!slot || !canvas) continue;

      const cellLeft = slot.x - layout.bleedPt;
      // PDF y-axis grows upward; layout y is measured from the page top.
      const cellBottom = layout.pageHeight - (slot.y + slot.height) - layout.bleedPt;
      const cellWidth = slot.width + 2 * layout.bleedPt;
      const cellHeight = slot.height + 2 * layout.bleedPt;

      const cmyk = await canvasToCmykBytes(canvas);
      const imageStream = pdf.context.flateStream(cmyk, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: PDFNumber.of(canvas.width),
        Height: PDFNumber.of(canvas.height),
        ColorSpace: iccBased,
        BitsPerComponent: PDFNumber.of(8),
      });
      const imageRef = pdf.context.register(imageStream);
      const imageName = `Im${sheetIndex}_${slotIndex}`;
      imageRefs[imageName] = imageRef;

      contentLines.push(`q ${cellWidth.toFixed(2)} 0 0 ${cellHeight.toFixed(2)} ${cellLeft.toFixed(2)} ${cellBottom.toFixed(2)} cm /${imageName} Do Q`);

      // --- Per-slot card number ---
      if (cardNumEnabled) {
        const label = `${cardNum.prefix}${cardCounter + cardNum.start - 1}`;
        const size = cardNum.fontSize;
        const textWidth = numberFont.widthOfTextAtSize(label, size);
        const marginPt = Math.max(0, cardNum.margin) * cardUnitPt;
        // Trim-box corners in PDF coordinates (y up).
        const trimLeft = slot.x;
        const trimRight = slot.x + slot.width;
        const trimTop = layout.pageHeight - slot.y;
        const trimBottom = layout.pageHeight - (slot.y + slot.height);
        let numX: number;
        let numBaseline: number;
        if (cardNum.position.endsWith('left')) numX = trimLeft + marginPt;
        else numX = trimRight - marginPt - textWidth;
        if (cardNum.position.startsWith('top')) numBaseline = trimTop - marginPt - size;
        else numBaseline = trimBottom + marginPt;
        contentLines.push(
          `BT ${cardNumRgb[0].toFixed(3)} ${cardNumRgb[1].toFixed(3)} ${cardNumRgb[2].toFixed(3)} rg /__NumberFont ${size} Tf ${numX.toFixed(2)} ${numBaseline.toFixed(2)} Td (${escapePdfText(label)}) Tj ET`
        );
      }

      // --- Crop marks for this cell ---
      if (settings.cropMarks) {
        const left = cellLeft;
        const right = cellLeft + cellWidth;
        const top = cellBottom + cellHeight;
        const bottom = cellBottom;
        const w = Math.max(0.25, markLengthPt * 0.07).toFixed(2);
        contentLines.push(`${markRgb[0].toFixed(3)} ${markRgb[1].toFixed(3)} ${markRgb[2].toFixed(3)} RG ${w} w`);
        const marks: [number, number, number, number][] = [
          [left - markOffsetPt - markLengthPt, top, left - markOffsetPt, top],
          [left, top + markOffsetPt + markLengthPt, left, top + markOffsetPt],
          [right + markOffsetPt, top, right + markOffsetPt + markLengthPt, top],
          [right, top + markOffsetPt + markLengthPt, right, top + markOffsetPt],
          [left - markOffsetPt - markLengthPt, bottom, left - markOffsetPt, bottom],
          [left, bottom - markOffsetPt - markLengthPt, left, bottom - markOffsetPt],
          [right + markOffsetPt, bottom, right + markOffsetPt + markLengthPt, bottom],
          [right, bottom - markOffsetPt - markLengthPt, right, bottom - markOffsetPt],
        ];
        for (const [x1, y1, x2, y2] of marks) {
          contentLines.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
        }
      }

      cardCounter += 1;
    }

    // --- Sheet number ---
    if (settings.numbering.mode !== 'none' && settings.numbering.position !== 'none') {
      const sheetNumber = firstSheetNumber + sheetIndex;
      const text = `${settings.numbering.prefix}${sheetNumber}`;
      const size = settings.numbering.fontSize;
      const textWidth = numberFont.widthOfTextAtSize(text, size);
      const inset = 18;
      let x: number;
      let baseline: number;
      if (settings.numbering.position.endsWith('left')) {
        x = inset;
      } else if (settings.numbering.position.endsWith('right')) {
        x = layout.pageWidth - inset - textWidth;
      } else {
        x = (layout.pageWidth - textWidth) / 2;
      }
      if (settings.numbering.position.startsWith('top')) {
        baseline = layout.pageHeight - inset - size;
      } else {
        baseline = inset;
      }
      // Text is drawn via the content stream (BT/Tf/Td/Tj/ET) to keep the
      // single-content-stream invariant; font is embedded in Resources.
      const fontRef = (numberFont as unknown as { ref: PDFRef }).ref;
      imageRefs.__NumberFontPlaceholder = fontRef;
      contentLines.push(
        `BT ${nr.toFixed(3)} ${ng.toFixed(3)} ${nb.toFixed(3)} rg /__NumberFont ${size} Tf ${x.toFixed(2)} ${baseline.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`
      );
    }

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
  }

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
}

/**
 * Build one imposed sheet as a single-page CMYK PDF.
 *
 * @param cardCanvases - Rendered card images for this sheet (row-major)
 * @param settings - Imposition settings
 * @param sheetNumber - 1-based sheet number for the numbering
 * @returns PDF bytes
 */
export async function buildSheetPdf(
  cardCanvases: HTMLCanvasElement[],
  settings: ImpositionSettings,
  sheetNumber = 1
): Promise<Uint8Array> {
  return buildSheetsPdf([cardCanvases], settings, sheetNumber);
}

/**
 * Render a preview of one imposed sheet onto a canvas (mirrors the PDF layout
 * produced by `buildSheetsPdf`).
 *
 * @param sheet - Card canvases for this sheet in row-major slot order
 * @param settings - Imposition settings
 * @param maxWidthPx - Preview pixel width (canvas is scaled to fit)
 * @returns Preview canvas, or null when the layout does not fit
 */
export function renderSheetPreview(
  sheet: HTMLCanvasElement[],
  settings: ImpositionSettings,
  maxWidthPx = 560
): HTMLCanvasElement | null {
  const layout = computeSheetLayout(settings);
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
  const cardNum = settings.cardNumbers;
  const cardNumEnabled = cardNum?.enabled === true;
  let cardCounter = cardNum?.start ?? 1;

  for (let index = 0; index < layout.slots.length; index += 1) {
    const slot = layout.slots[index];
    if (!slot) continue;
    const cardCanvas = sheet[index];

    const cellLeft = (slot.x - layout.bleedPt) * scale;
    const cellTop = (slot.y - layout.bleedPt) * scale;
    const cellWidth = (slot.width + 2 * layout.bleedPt) * scale;
    const cellHeight = (slot.height + 2 * layout.bleedPt) * scale;

    if (cardCanvas) {
      context.drawImage(cardCanvas, cellLeft, cellTop, cellWidth, cellHeight);
      // Trim box outline (blue = cut line).
      context.strokeStyle = 'rgba(59, 130, 246, 0.55)';
      context.lineWidth = 1;
      context.strokeRect(slot.x * scale, slot.y * scale, slot.width * scale, slot.height * scale);

      // Per-slot card number (mirrors the PDF placement).
      if (cardNumEnabled) {
        const label = `${cardNum.prefix}${cardCounter}`;
        const size = cardNum.fontSize;
        const marginPt = Math.max(0, cardNum.margin) * unitToPtFactor(settings.unit);
        context.font = `${size}px Helvetica, Arial, sans-serif`;
        context.fillStyle = cardNum.color;
        const metrics = context.measureText(label);
        const numLeft = cardNum.position.endsWith('left')
          ? slot.x + marginPt
          : slot.x + slot.width - marginPt - metrics.width;
        const numTop = cardNum.position.startsWith('top')
          ? slot.y + marginPt
          : slot.y + slot.height - marginPt - size;
        context.fillText(label, numLeft * scale, (numTop + size) * scale);
        cardCounter += 1;
      }
    } else {
      // Empty slot: dashed outline.
      context.strokeStyle = '#d1d5db';
      context.setLineDash([3, 3]);
      context.strokeRect(cellLeft, cellTop, cellWidth, cellHeight);
      context.setLineDash([]);
    }

    // Crop marks (same geometry as the PDF content stream).
    if (settings.cropMarks) {
      context.strokeStyle = settings.cropMarkColor;
      context.lineWidth = Math.max(0.5, markLengthPt * scale * 0.07);
      const left = cellLeft;
      const right = cellLeft + cellWidth;
      const top = cellTop;
      const bottom = cellTop + cellHeight;
      const marks: [number, number, number, number][] = [
        [left - (markOffsetPt + markLengthPt) * scale, top, left - markOffsetPt * scale, top],
        [left, top - (markOffsetPt + markLengthPt) * scale, left, top - markOffsetPt * scale],
        [right + markOffsetPt * scale, top, right + (markOffsetPt + markLengthPt) * scale, top],
        [right, top - (markOffsetPt + markLengthPt) * scale, right, top - markOffsetPt * scale],
        [left - (markOffsetPt + markLengthPt) * scale, bottom, left - markOffsetPt * scale, bottom],
        [left, bottom + markOffsetPt * scale, left, bottom + (markOffsetPt + markLengthPt) * scale],
        [right + markOffsetPt * scale, bottom, right + (markOffsetPt + markLengthPt) * scale, bottom],
        [right, bottom + markOffsetPt * scale, right, bottom + (markOffsetPt + markLengthPt) * scale],
      ];
      for (const [x1, y1, x2, y2] of marks) {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      }
    }
  }

  // Numbering preview (uses the same inset/alignment rules as the PDF).
  if (settings.numbering.mode !== 'none' && settings.numbering.position !== 'none') {
    const { position, fontSize, color, prefix } = settings.numbering;
    const text = `${prefix}1`;
    context.fillStyle = color;
    context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const metrics = context.measureText(text);
    const inset = 18;
    let x: number;
    if (position.endsWith('left')) x = inset;
    else if (position.endsWith('right')) x = canvas.width - inset - metrics.width;
    else x = (canvas.width - metrics.width) / 2;
    const baseline = position.startsWith('top')
      ? inset + fontSize
      : canvas.height - inset;
    context.fillText(text, x, baseline);
  }

  return canvas;
}

export { computeSheetLayout };
export type { ImpositionSettings, SheetLayout };
