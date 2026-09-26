/**
 * Batch generation service.
 * Composites the front/back designs for every data row, yields CMYK JPEG or
 * CMYK PDF blobs and packages them into a ZIP. Supports pause/resume/cancel
 * and reports progress with an ETA. Runs on the main thread in chunks
 * (requestAnimationFrame/idle yields) so the UI stays responsive.
 */
import JSZip from 'jszip';
import type { PsdProject, PsdDesign, SideType } from '@/types/psd';
import type { ExcelData, PhotoMatchResult, PhotoRecord } from '@/types/data';
import { compositeDesign } from './psdCompositeService';
import { encodeCmykJpeg, encodeCmykPdf, encodeCmykPdfDoubleSided } from './cmykExportService';
import { buildSheetsPdf } from './impositionService';
import type { ImpositionSettings } from './impositionTypes';
import { computeSheetLayout, pairBacksForDuplex } from './impositionTypes';
import { buildName } from './batchNaming';

/** Output settings for a batch run */
export interface BatchOptions {
  /** Output image format (v0.4.2: PNG removed, all outputs are CMYK) */
  format: 'jpg' | 'pdf';
  /** JPEG quality 0-1 (jpg only) */
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

export interface BatchCallbacks {
  onProgress: (state: BatchState) => void;
  /** Called once with the finished ZIP (or null when cancelled) */
  onComplete: (zip: Blob | null) => void;
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

/** Yield to the browser between cards (keeps UI responsive) */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
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
  const sheetLayout = isSheetMode ? computeSheetLayout(options.imposition) : null;
  if (isSheetMode && !sheetLayout) {
    errors.push({ rowIndex: -1, message: 'The cards do not fit on the selected paper size. Adjust the imposition settings.' });
    callbacks.onProgress({ control: 'done', current: 0, total, etaSeconds: 0, errors });
    callbacks.onComplete(null);
    return;
  }

  // Rendered cards accumulate here in sheet mode (front and back kept apart).
  const sheetCanvases: Record<SideType, HTMLCanvasElement[]> = { front: [], back: [] };

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
        // Accumulate for imposition at the end.
        for (const { side } of designs) {
          const canvas = rendered[side];
          if (canvas) sheetCanvases[side].push(canvas);
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
        }
      }
    } catch (error) {
      errors.push({
        rowIndex: row.rowIndex,
        message: error instanceof Error ? error.message : 'Unknown render error',
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

  // Sheet mode: assemble imposed sheets per side into one PDF each.
  if (isSheetMode && sheetLayout) {
    const perSheet = sheetLayout.perSheet;
    for (const { side } of designs) {
      let cards = sheetCanvases[side];
      // Duplex pairing: mirror back-sheet columns per row so long-edge duplex
      // printing lands each back exactly behind its front.
      if (side === 'back' && options.imposition.duplex) {
        cards = pairBacksForDuplex(cards, perSheet, sheetLayout.columns);
      }
      const sheets: HTMLCanvasElement[][] = [];
      for (let index = 0; index < cards.length; index += perSheet) {
        sheets.push(cards.slice(index, index + perSheet));
      }
      if (sheets.length === 0) continue;
      try {
        const bytes = await buildSheetsPdf(sheets, options.imposition, 1);
        zip.file(`sheet_${side === 'front' ? 'Front' : 'Back'}.${extension}`, bytes);
      } catch (error) {
        errors.push({
          rowIndex: -1,
          message: `${side} sheet assembly failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        });
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  callbacks.onProgress({
    control: 'done',
    current,
    total,
    etaSeconds: 0,
    errors,
  });
  callbacks.onComplete(zipBlob);
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
