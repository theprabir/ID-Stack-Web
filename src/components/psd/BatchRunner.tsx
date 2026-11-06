import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, Download, Loader2, Grid3x3, FileStack } from 'lucide-react';
import type { PsdProject } from '@/types/psd';
import type { ExcelData, PhotoMatchResult, DataRow } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { runBatch, type BatchOptions, type BatchState } from '@/services/batchService';
import {
  artworkSizePt,
  computeSheetLayout,
  countJobSheets,
  deriveCardSizeFromDesign,
  isCardSizeSyncedWithDesign,
  recordsPerSheetFor,
} from '@/services/impositionTypes';
import { compositeDesign } from '@/services/psdCompositeService';
import { ImpositionPanel } from './ImpositionPanel';
import { SheetPreview } from './SheetPreview';
import { Button, Input, Select, Label, Checkbox } from '@/components/ui';
import { getColumnNames, toCsv } from '@/services/excelService';

interface BatchRunnerProps {
  project: PsdProject;
  excelData: ExcelData;
  photoMatches: PhotoMatchResult;
  /** Whether Step 4 is the visible step — re-defaults the missing-photo toggle on each visit */
  isActive: boolean;
}

/** Output options that are local to the batch panel (not persisted). */
type LocalBatchOptions = Omit<BatchOptions, 'imposition'>;

/**
 * Batch generation panel: output options, run/pause/resume/cancel,
 * live progress with ETA and error list, ZIP download when done.
 *
 * Imposition settings have a SINGLE source of truth: the persisted
 * `usePsdStore.impositionSettings`. This component never keeps a local
 * copy — mirroring them into component state previously caused a
 * store↔state echo loop ("Maximum update depth exceeded", v0.6.1).
 */
export function BatchRunner({
  project,
  excelData,
  photoMatches,
  isActive,
}: BatchRunnerProps): JSX.Element {
  const control = usePsdStore((state) => state.batchControl);
  const batchState = usePsdStore((state) => state.batchState);
  const setBatchControl = usePsdStore((state) => state.setBatchControl);
  const setBatchState = usePsdStore((state) => state.setBatchState);
  const mappings = useDataStore((state) => state.mappings);
  const imposition = usePsdStore((state) => state.impositionSettings);
  const setImpositionSettings = usePsdStore((state) => state.setImpositionSettings);
  const restoreImpositionSettings = usePsdStore((state) => state.restoreImpositionSettings);

  // --- Missing-photo controls (v0.7.2) -----------------------------------
  // Single source of truth: records with no matched photo (toggle + CSV).
  const rowsMissingPhoto = useMemo(
    () => excelData.rows.filter((row) => !photoMatches.assignments.has(row.rowIndex)),
    [excelData.rows, photoMatches]
  );

  // Defaults to ENABLED on every visit to Step 4; a change the user makes
  // applies for the rest of that visit.
  const [includeMissingPhotos, setIncludeMissingPhotos] = useState(true);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) setIncludeMissingPhotos(true);
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Records this run will actually produce.
  const rowsToProcess = useMemo(
    () =>
      includeMissingPhotos
        ? excelData.rows
        : excelData.rows.filter((row) => photoMatches.assignments.has(row.rowIndex)),
    [includeMissingPhotos, excelData.rows, photoMatches]
  );

  const [options, setOptions] = useState<LocalBatchOptions>({
    format: 'jpg',
    quality: 0.92,
    naming: '{Name}_{Row}',
    sides: 'both',
    outputMode: 'cards',
  });

  // Restore persisted imposition settings once at mount.
  useEffect(() => {
    void restoreImpositionSettings();
  }, [restoreImpositionSettings]);

  /** Finished downloads: one PDF, a ZIP, or the numbered parts of a big job */
  const [output, setOutput] = useState<{ url: string; fileName: string }[] | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const controlRef = useRef<'running' | 'paused' | 'cancelled' | 'done'>('done');

  // Card size is ALWAYS locked to the uploaded front PSD: pixels ÷ DPI × 72
  // = points (a 300-DPI 1056×663 px card derives to a true 86×54 mm card,
  // NOT raw pixel numbers). The card-direction selector swaps width/height
  // at that same true scale. When the stored size does not match the design
  // (fresh project, unit switch, stale/corrupt persisted value), it is
  // re-derived and written to the store — one idempotent write, after which
  // the sync check passes and the effect bails.
  const designSize = useMemo(
    () =>
      project.front
        ? {
            width: project.front.width,
            height: project.front.height,
            dpi: project.front.horizontalResolution,
          }
        : null,
    [project.front]
  );
  // EXACT print geometry: the design's own pixels at its own resolution, i.e.
  // px ÷ DPI × 72 pt. Preview and PDF share this single value, so a card is
  // never scaled (no up-, no down-scaling) and bleed only reserves space
  // around the trim box.
  const exactCardSizePt = useMemo(
    () =>
      project.front
        ? artworkSizePt(
            project.front.width,
            project.front.height,
            project.front.horizontalResolution,
            imposition.cardOrientation
          )
        : undefined,
    [project.front, imposition.cardOrientation]
  );

  const impositionUnit = imposition.unit;
  const cardDirection = imposition.cardOrientation;
  const cardWidth = imposition.cardWidth;
  const cardHeight = imposition.cardHeight;
  useEffect(() => {
    if (!designSize) return;
    if (!Number.isFinite(designSize.width) || !Number.isFinite(designSize.height)) return;
    const current = { cardWidth, cardHeight, unit: impositionUnit, cardOrientation: cardDirection };
    if (isCardSizeSyncedWithDesign(current, designSize.width, designSize.height, designSize.dpi)) {
      return;
    }
    const { width, height } = deriveCardSizeFromDesign(
      designSize.width,
      designSize.height,
      cardDirection,
      impositionUnit,
      designSize.dpi
    );
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setImpositionSettings({ ...imposition, cardWidth: width, cardHeight: height });
  }, [
    designSize,
    cardWidth,
    cardHeight,
    cardDirection,
    impositionUnit,
    imposition,
    setImpositionSettings,
  ]);

  // --- Live imposed-sheet preview with REAL card images -------------------
  const isPreviewActive = options.outputMode === 'sheets' && options.format === 'pdf';

  // Render a handful of sample cards (first rows) for the preview.
  const [sampleCanvases, setSampleCanvases] = useState<{
    front: HTMLCanvasElement[];
    back: HTMLCanvasElement[];
  }>({ front: [], back: [] });
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  const previewRows = useMemo<DataRow[]>(() => rowsToProcess.slice(0, 8), [rowsToProcess]);
  const previewRowKey = useMemo(
    () => previewRows.map((row) => row.rowIndex).join(','),
    [previewRows]
  );
  const mappingsKey = useMemo(() => JSON.stringify(mappings), [mappings]);

  useEffect(() => {
    if (!isPreviewActive) return;
    if (!project.front && !project.back) return;
    if (previewRows.length === 0) return;
    let cancelled = false;
    setIsRenderingPreview(true);
    const run = async (): Promise<void> => {
      try {
        const front: HTMLCanvasElement[] = [];
        const back: HTMLCanvasElement[] = [];
        for (const row of previewRows) {
          const photo = photoMatches.assignments.get(row.rowIndex);
          if (project.front) {
            front.push(
              await compositeDesign(project.front, {
                placeholders: project.placeholders.filter((p) => p.side === 'front'),
                mappings,
                row,
                getPhoto: () => photo,
                scale: 0.35,
              })
            );
          }
          if (project.back) {
            back.push(
              await compositeDesign(project.back, {
                placeholders: project.placeholders.filter((p) => p.side === 'back'),
                mappings,
                row,
                getPhoto: () => photo,
                scale: 0.35,
              })
            );
          }
        }
        if (!cancelled) setSampleCanvases({ front, back });
      } catch {
        if (!cancelled) setSampleCanvases({ front: [], back: [] });
      } finally {
        if (!cancelled) setIsRenderingPreview(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewActive, project.front, project.back, previewRowKey, mappingsKey, photoMatches]);

  // Sheet counts for the job (shared with generation so they cannot drift).
  const sheetPlan = useMemo(() => {
    if (!isPreviewActive) return null;
    const layout = computeSheetLayout(imposition, undefined, exactCardSizePt);
    if (!layout) return null;
    const hasFront = Boolean(project.front) && options.sides !== 'back';
    const hasBack = Boolean(project.back) && options.sides !== 'front';
    const counts = countJobSheets(
      layout,
      hasFront ? rowsToProcess.length : 0,
      hasBack ? rowsToProcess.length : 0,
      imposition.arrangement
    );
    return { layout, counts, hasFront, hasBack };
  }, [
    isPreviewActive,
    imposition,
    exactCardSizePt,
    rowsToProcess.length,
    project.front,
    project.back,
    options.sides,
  ]);

  const sheetSummary = useMemo(() => {
    if (!sheetPlan) return null;
    const { layout, counts, hasBack } = sheetPlan;
    if (imposition.arrangement === 'interleaved') {
      const records = recordsPerSheetFor(layout, 'interleaved', hasBack);
      const frontRowsPerSheet = Math.max(1, Math.round(records / layout.columns));
      return hasBack
        ? `${layout.columns} × ${frontRowsPerSheet} pairs per sheet · ${counts.total} sheet(s)`
        : `${layout.columns} × ${frontRowsPerSheet} cards per sheet · ${counts.total} sheet(s)`;
    }
    return `${layout.perSheet} cards per sheet · ${counts.frontSheets} front + ${counts.backSheets} back sheet(s)`;
  }, [sheetPlan, imposition.arrangement]);

  const setControl = useCallback(
    (value: 'running' | 'paused' | 'cancelled' | 'done') => {
      controlRef.current = value;
      setBatchControl(value);
    },
    [setBatchControl]
  );

  const start = useCallback(async () => {
    if (output) output.forEach((file) => URL.revokeObjectURL(file.url));
    setOutput(null);
    setControl('running');
    setBatchState({
      control: 'running',
      current: 0,
      total: rowsToProcess.length,
      etaSeconds: 0,
      errors: [],
    });

    const batchOptions: BatchOptions = { ...options, imposition };
    await runBatch(
      project,
      { ...excelData, rows: rowsToProcess },
      mappings,
      photoMatches,
      batchOptions,
      () => controlRef.current,
      {
        onProgress: (state: BatchState) => {
          setBatchState(state);
          if (state.control !== 'running') setControl(state.control);
        },
        onComplete: (result) => {
          setIsZipping(false);
          if (result) {
            // A very large sheet job arrives as several numbered PDFs; a
            // normal job arrives as the single file (or ZIP) in `blob`.
            const files = result.parts ?? [
              { blob: result.blob, fileName: result.fileName },
            ];
            setOutput(
              files.map((file) => ({
                url: URL.createObjectURL(file.blob),
                fileName: file.fileName,
              }))
            );
          }
          setControl('done');
        },
      }
    );
  }, [
    project,
    excelData,
    rowsToProcess,
    mappings,
    photoMatches,
    options,
    imposition,
    output,
    setBatchState,
    setControl,
  ]);

  /** Export the records with no matched photo as a UTF-8 CSV (v0.7.2). */
  const downloadMissingPhotos = useCallback(() => {
    if (rowsMissingPhoto.length === 0) return;
    const csv = toCsv(getColumnNames(excelData), rowsMissingPhoto);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'missing-photos.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [excelData, rowsMissingPhoto]);

  const isRunning = control === 'running' || control === 'paused';
  const progress = batchState
    ? batchState.total > 0
      ? (batchState.current / batchState.total) * 100
      : 0
    : 0;

  return (
    <section
      className="flex h-full flex-col rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="batch-runner-title"
    >
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Play className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="batch-runner-title" className="text-sm font-semibold">
          Generate Cards
        </h2>
      </div>

      {/* Two-column layout: controls left, live preview right */}
      <div className="themed-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
        {/* Options + progress (left) */}
        <div className="flex min-w-0 flex-col">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="batch-format" className="mb-1 block text-xs text-muted-foreground">
                Format
              </Label>
              <Select
                id="batch-format"
                value={options.format}
                disabled={isRunning}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    format: event.target.value as 'jpg' | 'pdf',
                  }))
                }
              >
                <option value="jpg">JPG (CMYK)</option>
                <option value="pdf">PDF (CMYK)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="batch-sides" className="mb-1 block text-xs text-muted-foreground">
                Sides
              </Label>
              <Select
                id="batch-sides"
                value={options.sides}
                disabled={isRunning}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    sides: event.target.value as 'both' | 'front' | 'back',
                  }))
                }
              >
                <option value="both">Front + Back</option>
                <option value="front">Front only</option>
                <option value="back">Back only</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="batch-naming" className="mb-1 block text-xs text-muted-foreground">
                File naming
              </Label>
              <Input
                id="batch-naming"
                value={options.naming}
                disabled={isRunning}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, naming: event.target.value }))
                }
                className="h-10 text-xs"
                placeholder="{Name}_{Row}"
              />
            </div>
            <div>
              <Label
                htmlFor="batch-output-mode"
                className="mb-1 block text-xs text-muted-foreground"
              >
                Output layout
              </Label>
              <Select
                id="batch-output-mode"
                value={options.outputMode}
                disabled={isRunning || options.format !== 'pdf'}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    outputMode: event.target.value as 'cards' | 'sheets',
                  }))
                }
                className="h-10 text-xs"
              >
                <option value="cards">Cards (one file each)</option>
                <option value="sheets" disabled={options.format !== 'pdf'}>
                  Sheets (imposed, PDF only)
                </option>
              </Select>
            </div>
            <div className="flex items-end">
              {isRunning ? (
                <div className="flex w-full gap-1">
                  {control === 'running' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setControl('paused')}
                    >
                      <Pause className="h-4 w-4" aria-hidden="true" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setControl('running')}
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Resume
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => setControl('cancelled')}>
                    <Square className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => void start()}
                  disabled={rowsToProcess.length === 0}
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Generate {rowsToProcess.length} card(s)
                </Button>
              )}
            </div>
          </div>

          {/* Missing-photo controls (v0.7.2): include toggle + CSV download */}
          <div className="mt-3 rounded-md border bg-surface-card/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="include-missing-photos"
                className="flex cursor-pointer items-center gap-2 text-xs font-medium"
              >
                <Checkbox
                  id="include-missing-photos"
                  checked={includeMissingPhotos}
                  disabled={isRunning}
                  onChange={(event) => setIncludeMissingPhotos(event.target.checked)}
                />
                Include records without photos
              </label>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {rowsMissingPhoto.length} of {excelData.rows.length} missing
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {includeMissingPhotos
                ? 'All records are generated; the photo area stays blank when a photo is missing.'
                : 'Only records with a matched photo are generated.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={downloadMissingPhotos}
              disabled={rowsMissingPhoto.length === 0 || isRunning}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download missing-photo list ({rowsMissingPhoto.length})
            </Button>
          </div>

          {/* Imposition settings (sheets mode) — left column, under the options */}
          {options.outputMode === 'sheets' && options.format === 'pdf' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Grid3x3 className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-xs font-semibold">Sheet layout — everything is adjustable</h3>
              </div>
              <ImpositionPanel
                settings={imposition}
                disabled={isRunning}
                onChange={setImpositionSettings}
              />
            </div>
          )}

          {/* Progress */}
          {batchState && (
            <div className="mt-3">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-surface-card"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {control === 'paused' && <Pause className="h-3 w-3" aria-hidden="true" />}
                {isZipping && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                {batchState.current} / {batchState.total} cards
                {batchState.etaSeconds > 1 && control === 'running' && (
                  <>
                    {' · '}
                    {batchState.etaSeconds > 60
                      ? `${Math.ceil(batchState.etaSeconds / 60)} min left`
                      : `${Math.round(batchState.etaSeconds)}s left`}
                  </>
                )}
              </p>
              {batchState.errors.length > 0 && (
                <ul className="themed-scrollbar mt-1 max-h-20 overflow-auto rounded border bg-surface-card p-1.5 text-xs text-destructive">
                  {batchState.errors.slice(0, 10).map((error, index) => (
                    <li key={`${error.rowIndex}-${index}`}>
                      Row {error.rowIndex + 1}: {error.message}
                    </li>
                  ))}
                  {batchState.errors.length > 10 && (
                    <li>…and {batchState.errors.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Download: one file, or the numbered parts of a split job */}
          {output && output.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {output.map((file) => (
                <Button
                  key={file.fileName}
                  variant="default"
                  className="w-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = file.url;
                    link.download = file.fileName;
                    link.click();
                  }}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download {file.fileName}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Right: live sheet preview (sheets mode) — fixed-height internal scroll */}
        <div className="flex min-w-0 flex-col">
          {options.outputMode === 'sheets' && options.format === 'pdf' ? (
            <>
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <FileStack className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <h3 className="text-xs font-semibold">Live sheet preview</h3>
              </div>
              <p className="mb-2 shrink-0 text-xs text-muted-foreground">
                Real cards at their true print size — updates as you change any setting. Empty
                slots are dashed; blue = trim line. Turn on the proof overlay to see the bleed
                and safe area. Very large jobs are written as numbered PDFs so memory stays flat.
              </p>
              {sheetSummary && (
                <p className="mb-1 shrink-0 text-xs font-medium text-foreground">{sheetSummary}</p>
              )}
              <SheetPreview
                fronts={sampleCanvases.front}
                backs={sampleCanvases.back}
                settings={imposition}
                totalSheets={sheetPlan?.counts.total ?? 0}
                cardSizePt={exactCardSizePt}
                isRendering={isRenderingPreview}
              />
            </>
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center rounded border border-dashed bg-surface-canvas p-4 text-center text-xs text-muted-foreground">
              Switch output layout to <strong className="mx-1">Sheets</strong> (PDF format) to
              design the imposed sheet here with a live preview.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
