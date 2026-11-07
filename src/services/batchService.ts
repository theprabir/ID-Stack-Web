/**
 * Batch generation service.
 * Composites the front/back designs for every data row, yields CMYK JPEG or
 * CMYK PDF blobs and packages them into a ZIP. Supports pause/resume/cancel
 * and reports progress with an ETA. Runs on the main thread in chunks
 * (requestAnimationFrame/idle yields) so the UI stays responsive.
 *
 * MEMORY (v0.7.4): imposed-sheet jobs are streamed through `SheetJobWriter`.
 * Cards are composited one sheet at a time, encoded into the running PDF page
 * and their canvases are released immediately instead of being collected for
 * the whole job. A 600-record job previously held every rendered card
 * (~2.7 MB each, both faces) until the final PDF step — multiple gigabytes,
 * i.e. a tab crash. The PDF document itself is bounded too: once a part holds
 * its budget of card images it is serialised to a Blob and a fresh document
 * continues the job with continuous numbering, so memory stays flat as the
 * record count grows (the output is then several numbered PDFs).
 * Separate-sheets jobs buffer only the *encoded* back faces of the current
 * part (a few hundred KB each), because back pages follow front pages in the
 * same document.
 */
import JSZip from 'jszip';
import type { PsdProject, PsdDesign, SideType } from '@/types/psd';
import type { ExcelData, PhotoMatchResult, PhotoRecord } from '@/types/data';
import { compositeDesign } from './psdCompositeService';
import { encodeCmykJpeg, encodeCmykPdf, encodeCmykPdfDoubleSided } from './cmykExportService';
import { encodeCardForSheet, releaseCanvas } from './impositionService';
import type { ImpositionSettings } from './impositionTypes';
import {
  artworkSizePt,
  cardNumberFor,
  computeSheetLayout,
  countJobSheets,
  recordsPerSheetFor,
} from './impositionTypes';
import { SheetJobWriter } from './sheetJobWriter';
import { buildName } from './batchNaming';

/** Output settings for a batch run */
export interface BatchOptions {
  /** Output image format (v0.4.2: PNG removed, all outputs are CMYK) */
  format: 'jpg' | 'pdf';
  /** JPEG quality 0-1 (jpg output and imposed-sheet card images) */
  quality: number;
  /** File name template: {Name}, {ID} and {Row} are supported */
  naming: string;
  /** Export both faces (front/back suffixes) or front only */
  sides: 'both' | 'front' | 'back';
  /**
   * Output layout (v0.5.0): 'cards' = one file per card/person,
   * 'sheets' = imposed multi-card sheets (PDF only).
   */
  outputMode: 'cards' | 'sheets';
  /** Imposition settings (sheets mode only) */
  imposition: ImpositionSettings;
}

export type BatchControl = 'running' | 'paused' | 'cancelled' | 'done';

export interface BatchState {
  control: BatchControl;
  current: number;
  total: number;
  /** Seconds remaining estimate */
  etaSeconds: number;
  errors: { rowIndex: number; message: string }[];
}

/** One downloadable file produced by a batch run */
export interface BatchFile {
  blob: Blob;
  fileName: string;
}

/**
 * A finished download: one ZIP (cards mode) or the imposed PDF (sheets mode).
 *
 * Large sheet jobs are written in bounded parts so a 600+ record run cannot
 * exhaust the tab's memory; `parts` then holds one PDF per part (the first is
 * also exposed as the primary download for older callers).
 */
export interface BatchOutput extends BatchFile {
  /** Split PDFs of an oversized sheet job (absent for a single file) */
  parts?: BatchFile[];
}

export interface BatchCallbacks {
  onProgress: (state: BatchState) => void;
  /** Called once with the finished download (or null when cancelled) */
  onComplete: (output: BatchOutput | null) => void;
  /**
   * Called whenever an imposed sheet page has been written so the UI can
   * show sheet-level progress (sheets mode only).
   */
  onSheetWritten?: (sheetNumber: number, totalSheets: number) => void;
}

/** Human-readable description for any thrown value (string, object, …) */
function describeUnknownError(error: unknown): string {
  if (typeof error === 'string' && error.length > 0) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.length > 0) return message;
  }
  return 'Unknown render error';
}

/** Wait until resumed or cancelled; resolves 'continue' | 'abort' */
function waitWhilePaused(getControl: () => BatchControl): Promise<'continue' | 'abort'> {
  return new Promise((resolve) => {
    const check = (): void => {
      const control = getControl();
      if (control === 'paused') {
        setTimeout(check, 150);
      } else if (control === 'cancelled') {
        resolve('abort');
      } else {
        resolve('continue');
      }
    };
    check();
  });
}

/**
 * Yield to the browser between cards (keeps UI responsive).
 *
 * rAF alone is not enough: browsers suspend it in hidden/background tabs, so a
 * job that outlives a tab switch used to freeze after one card. The timer is a
 * safety net — whichever fires first resumes the loop.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const resume = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(resume);
      setTimeout(resume, 50);
    } else {
      setTimeout(resume, 0);
    }
  });
}

/** Output base name (no extension) for a sheet-mode job */
function sheetBaseName(
  arrangement: ImpositionSettings['arrangement'],
  hasFront: boolean,
  hasBack: boolean
): string {
  if (arrangement === 'interleaved') return 'sheet_Print';
  if (hasFront && hasBack) return 'sheet_Front_Back';
  if (hasFront) return 'sheet_Front';
  return 'sheet_Back';
}

/**
 * Run batch generation.
 *
 * @param project - Dual-sided PSD project with placeholders
 * @param data - Parsed Excel data
 * @param mappings - Placeholder key → Excel column
 * @param photoMatches - Row → photo assignments
 * @param options - Output options
 * @param controlRef - Getter for the current control state (paused/cancelled)
 * @param callbacks - Progress and completion callbacks
 */
export async function runBatch(
  project: PsdProject,
  data: ExcelData,
  mappings: Record<string, string>,
  photoMatches: PhotoMatchResult,
  options: BatchOptions,
  controlRef: () => BatchControl,
  callbacks: BatchCallbacks
): Promise<void> {
  const started = Date.now();
  const total = data.rows.length;
  const errors: { rowIndex: number; message: string }[] = [];
  const zip = new JSZip();

  const designs: Array<{ side: SideType; design: PsdDesign }> = [
    { side: 'front', design: project.front },
    { side: 'back', design: project.back },
  ].filter((entry): entry is { side: SideType; design: PsdDesign } => {
    if (!entry.design) return false;
    return options.sides === 'both' || options.sides === entry.side;
  });

  if (designs.length === 0) {
    callbacks.onProgress({ control: 'done', current: 0, total, etaSeconds: 0, errors });
    callbacks.onComplete(null);
    return;
  }

  const extension = options.format === 'pdf' ? 'pdf' : 'jpg';
  const isSheetMode = options.outputMode === 'sheets' && options.format === 'pdf';

  const hasFront = designs.some((entry) => entry.side === 'front');
  const hasBack = designs.some((entry) => entry.side === 'back');
  const arrangement = options.imposition.arrangement;
  /** Separate sheets: this part also carries the back pages of its records */
  const backFacesSeparate = arrangement === 'separate' && hasFront && hasBack;

  // EXACT card geometry (v0.7.4): a card prints at its own pixel size at the
  // design's resolution — never at the rounded unit setting and never at the
  // bleed box. Layout and image placement share this one value, so the scale
  // factor is exactly 1.000 (no up- or down-scaling by any amount).
  const designForSize = project.front ?? project.back ?? null;
  const cardSizePt = designForSize
    ? artworkSizePt(
        designForSize.width,
        designForSize.height,
        designForSize.horizontalResolution,
        options.imposition.cardOrientation
      )
    : null;

  const sheetLayout = isSheetMode
    ? computeSheetLayout(options.imposition, undefined, cardSizePt ?? undefined)
    : null;
  if (isSheetMode && !sheetLayout) {
    errors.push({
      rowIndex: -1,
      message: 'The cards do not fit on the selected paper size. Adjust the imposition settings.',
    });
    callbacks.onProgress({ control: 'done', current: 0, total, etaSeconds: 0, errors });
    callbacks.onComplete(null);
    return;
  }

  // Paired interleaving needs BOTH faces: row 1 = fronts, row 2 = the
  // matching backs. With a single face the job just fills slots row-major.
  const pairedInterleaved = Boolean(
    isSheetMode && arrangement === 'interleaved' && hasFront && hasBack && sheetLayout
  );

  let writer: SheetJobWriter | null = null;
  if (isSheetMode && sheetLayout && cardSizePt) {
    const counts = countJobSheets(
      sheetLayout,
      hasFront ? total : 0,
      hasBack ? total : 0,
      arrangement
    );
    writer = await SheetJobWriter.create({
      settings: options.imposition,
      layout: sheetLayout,
      cardSizePt,
      dpi: designForSize?.horizontalResolution,
      quality: options.quality,
      totalSheets: counts.total,
      hasBackFaces: backFacesSeparate,
      baseName: sheetBaseName(arrangement, hasFront, hasBack),
      onSheetWritten: callbacks.onSheetWritten,
    });
  }

  // Row cursor inside the current interleaved page (paired mode).
  let pairRowsOnSheet = 0;
  const columns = sheetLayout?.columns ?? 1;
  /**
   * Records one interleaved page holds — every column of every front row.
   * Card numbers restart every sheet in per-sheet mode, and the page flush
   * uses the same value (it counts RECORDS, so comparing it with the number
   * of pair-rows flushed after a single record: one card per page, with the
   * rest of the sheet left empty).
   */
  const recordsPerSheet = sheetLayout
    ? recordsPerSheetFor(sheetLayout, arrangement, hasBack)
    : 1;
  /** Records actually placed so far (a failed row must not consume a number) */
  let placedRecords = 0;

  let current = 0;
  for (const row of data.rows) {
    const control = controlRef();
    if (control === 'cancelled') break;
    if (control === 'paused') {
      const verdict = await waitWhilePaused(controlRef);
      if (verdict === 'abort') break;
    }

    try {
      const photo: PhotoRecord | undefined = photoMatches.assignments.get(row.rowIndex);
      const base = buildName(options.naming, row);

      // Render every requested side for this row.
      const rendered: Partial<Record<SideType, HTMLCanvasElement>> = {};
      for (const { side, design } of designs) {
        rendered[side] = await compositeDesign(design, {
          placeholders: project.placeholders.filter((placeholder) => placeholder.side === side),
          mappings,
          row,
          getPhoto: () => photo,
        });
      }

      if (isSheetMode) {
        if (!writer) {
          // No writer (should not happen) — release to avoid holding memory.
          releaseCanvas(rendered.front);
          releaseCanvas(rendered.back);
        } else if (pairedInterleaved) {
          // Interleaved pairs: front on the upper row, its back directly below.
          // BOTH faces get the record's number, so they print the same value.
          const cardNumber = cardNumberFor(
            options.imposition.numbering,
            placedRecords,
            recordsPerSheet
          );
          const frontRow = Math.floor(pairRowsOnSheet / columns);
          const column = pairRowsOnSheet % columns;
          writer.put(frontRow * 2 * columns + column, rendered.front ?? null, cardNumber);
          writer.put(
            (frontRow * 2 + 1) * columns + column,
            rendered.back ?? null,
            cardNumber
          );
          placedRecords += 1;
          pairRowsOnSheet += 1;
          if (pairRowsOnSheet === recordsPerSheet) {
            await writer.flushPage();
            pairRowsOnSheet = 0;
          }
        } else {
          const cardNumber = cardNumberFor(
            options.imposition.numbering,
            placedRecords,
            recordsPerSheet
          );
          // Fronts stream directly into their page, row-major.
          if (rendered.front) {
            writer.putNext(rendered.front, cardNumber);
            if (writer.isFull) await writer.flushPage();
          }
          if (rendered.back) {
            if (backFacesSeparate) {
              // Back pages follow front pages in the same part: hold the
              // COMPRESSED bytes (a few hundred KB) rather than the canvas.
              // The same number rides along to the back page.
              writer.putBack(
                await encodeCardForSheet(rendered.back, options.quality),
                cardNumber
              );
              releaseCanvas(rendered.back);
            } else {
              writer.putNext(rendered.back, cardNumber);
              if (writer.isFull) await writer.flushPage();
            }
          }
          placedRecords += 1;
        }
      } else if (options.format === 'pdf' && designs.length === 2) {
        // Double-sided PDF: one file per person, front = page 1, back = page 2.
        const bytes = await encodeCmykPdfDoubleSided(
          rendered.front as HTMLCanvasElement,
          rendered.back as HTMLCanvasElement
        );
        zip.file(`${base}.${extension}`, bytes);
      } else {
        for (const { side, design } of designs) {
          void design;
          const canvas = rendered[side];
          if (!canvas) continue;
          const sideSuffix = designs.length > 1 ? `_${side === 'front' ? 'Front' : 'Back'}` : '';
          if (options.format === 'pdf') {
            const bytes = await encodeCmykPdf(canvas);
            zip.file(`${base}${sideSuffix}.${extension}`, bytes);
          } else {
            const bytes = await encodeCmykJpeg(canvas, options.quality);
            zip.file(`${base}${sideSuffix}.${extension}`, bytes);
          }
          releaseCanvas(canvas);
        }
      }
    } catch (error) {
      // Per-row isolation: one bad row must never kill the batch.
      errors.push({
        rowIndex: row.rowIndex,
        message: error instanceof Error ? error.message : describeUnknownError(error),
      });
    }

    current += 1;
    const elapsed = (Date.now() - started) / 1000;
    const etaSeconds = current > 0 ? (elapsed / current) * (total - current) : 0;
    callbacks.onProgress({
      control: controlRef() === 'cancelled' ? 'cancelled' : controlRef(),
      current,
      total,
      etaSeconds,
      errors: [...errors],
    });

    await nextFrame();
  }

  if (controlRef() === 'cancelled') {
    callbacks.onProgress({ control: 'cancelled', current, total, etaSeconds: 0, errors });
    callbacks.onComplete(null);
    return;
  }

  // --- Sheet mode: close the streamed PDF (or its parts) ------------------
  if (isSheetMode && writer) {
    try {
      const streams = await writer.finish();
      const first = streams[0];
      if (!first) {
        errors.push({ rowIndex: -1, message: 'Nothing was placed on any sheet.' });
        callbacks.onProgress({ control: 'done', current, total, etaSeconds: 0, errors });
        callbacks.onComplete(null);
        return;
      }
      callbacks.onProgress({ control: 'done', current, total, etaSeconds: 0, errors });
      callbacks.onComplete({
        blob: first.blob,
        fileName: first.fileName,
        parts:
          streams.length > 1
            ? streams.map(({ blob, fileName }) => ({ blob, fileName }))
            : undefined,
      });
      return;
    } catch (error) {
      errors.push({
        rowIndex: -1,
        message: `Sheet assembly failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      });
      callbacks.onProgress({ control: 'done', current, total, etaSeconds: 0, errors });
      callbacks.onComplete(null);
      return;
    }
  }

  let zipBlob: Blob;
  try {
    zipBlob = await zip.generateAsync({ type: 'blob' });
  } catch (error) {
    // ZIP assembly is the last irreversible step — surface it as a job-level
    // error instead of an unhandled rejection that would freeze the UI.
    errors.push({
      rowIndex: -1,
      message: `ZIP packaging failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    callbacks.onProgress({ control: 'done', current, total, etaSeconds: 0, errors });
    callbacks.onComplete(null);
    return;
  }
  callbacks.onProgress({
    control: 'done',
    current,
    total,
    etaSeconds: 0,
    errors,
  });
  callbacks.onComplete({ blob: zipBlob, fileName: 'id-cards.zip' });
}

/**
 * Trigger a browser download for a blob.
 * @param blob - File contents
 * @param fileName - Suggested download name
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke later so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
