/**
 * Batch generation service.
 * Composites the front/back designs for every data row, yields PNG/JPEG
 * blobs and packages them into a ZIP. Supports pause/resume/cancel and
 * reports progress with an ETA. Runs on the main thread in chunks
 * (requestAnimationFrame/idle yields) so the UI stays responsive; a
 * Web Worker port is behind the same interface for Phase 6.
 */
import JSZip from 'jszip';
import type { PsdProject, PsdDesign, SideType } from '@/types/psd';
import type { ExcelData, PhotoMatchResult, PhotoRecord } from '@/types/data';
import { compositeDesign, canvasToBlob } from './psdCompositeService';
import { buildName } from './batchNaming';

/** Output settings for a batch run */
export interface BatchOptions {
  /** Output image format */
  format: 'png' | 'jpg';
  /** JPEG quality 0-1 (jpg only) */
  quality: number;
  /** File name template: {Name}, {ID} and {Row} are supported */
  naming: string;
  /** Export both faces (front/back suffixes) or front only */
  sides: 'both' | 'front' | 'back';
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

  const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
  const extension = options.format === 'png' ? 'png' : 'jpg';

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
      for (const { side, design } of designs) {
        const canvas = await compositeDesign(design, {
          placeholders: project.placeholders.filter((placeholder) => placeholder.side === side),
          mappings,
          row,
          getPhoto: () => photo,
        });
        const blob = await canvasToBlob(canvas, mime, options.quality);
        const sideSuffix = designs.length > 1 ? `_${side === 'front' ? 'Front' : 'Back'}` : '';
        const base = buildName(options.naming, row);
        zip.file(`${base}${sideSuffix}.${extension}`, blob);
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
