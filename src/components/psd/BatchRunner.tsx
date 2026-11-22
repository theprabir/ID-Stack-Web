import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, Download, Loader2, Grid3x3, FileStack, FolderOpen } from 'lucide-react';
import type { PsdProject } from '@/types/psd';
import type { ExcelData, PhotoMatchResult, DataRow } from '@/types/data';
import { rowKey } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import {
  runBatchSources,
  type BatchOptions,
  type BatchSource,
  type BatchState,
} from '@/services/batchService';
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
import { saveExport, revealExportPath, type SaveExportResult } from '@/services/exportService';
import { setBatchActive } from '@/services/keepAwake';
import { logMessage } from '@/services/appLog';
import { useTaskbarProgress } from '@/hooks/useTaskbarProgress';

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
  const sources = useDataStore((state) => state.sources);
  const photoMatchBySource = useDataStore((state) => state.photoMatchBySource);
  const imposition = usePsdStore((state) => state.impositionSettings);
  const setImpositionSettings = usePsdStore((state) => state.setImpositionSettings);
  const restoreImpositionSettings = usePsdStore((state) => state.restoreImpositionSettings);

  // Usable sources (a column-mismatched file blocks the whole run, v0.7.6).
  const validSources = useMemo(
    () => sources.filter((source) => !source.error && source.rows.length > 0),
    [sources]
  );
  const blockedSources = useMemo(() => sources.filter((source) => source.error), [sources]);
  const totalSourceRows = useMemo(
    () => validSources.reduce((sum, source) => sum + source.rows.length, 0),
    [validSources]
  );

  // --- Missing-photo controls (v0.7.2) -----------------------------------
  // Single source of truth: records with no matched photo (toggle + CSV),
  // aggregated across every data source.
  const rowsMissingPhoto = useMemo(
    () =>
      validSources.flatMap((source) =>
        source.rows.filter((row) => {
          const match = photoMatchBySource[source.id] ?? photoMatches;
          return !match.assignments.has(rowKey(row));
        })
      ),
    [validSources, photoMatchBySource, photoMatches]
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
      validSources.flatMap((source) => {
        const match = photoMatchBySource[source.id] ?? photoMatches;
        return includeMissingPhotos
          ? source.rows
          : source.rows.filter((row) => match.assignments.has(rowKey(row)));
      }),
    [includeMissingPhotos, validSources, photoMatchBySource, photoMatches]
  );

  const [options, setOptions] = useState<LocalBatchOptions>({
    format: 'pdf',
    quality: 0.92,
    naming: '{Name}_{Row}',
    sides: 'both',
    outputMode: 'sheets',
  });

  // Restore persisted imposition settings once at mount.
  useEffect(() => {
    void restoreImpositionSettings();
  }, [restoreImpositionSettings]);

  /** Finished files waiting to be saved: one PDF, a ZIP, or numbered parts */
  const [output, setOutput] = useState<{ blob: Blob; fileName: string }[] | null>(null);
  /** Outcome of the last native save, for the "Open folder" affordance */
  const [lastSave, setLastSave] = useState<{
    fileName: string;
    path: string | null;
    status: SaveExportResult['status'];
    error?: string;
  } | null>(null);
  const [savingFile, setSavingFile] = useState<string | null>(null);
  /** Download block: scrolled into view automatically when a run finishes */
  const downloadRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<'running' | 'paused' | 'cancelled' | 'done'>('done');

  // A finished job should not leave the download button off-screen: after the
  // output renders, bring it into view inside the panel's scroll area.
  useEffect(() => {
    if (!output || output.length === 0) return;
    // Called straight from the effect (no rAF) and instantly (no smooth scroll):
    // effects run after the block is in the DOM, and a background tab throttles
    // both rAF and smooth scrolling, which would leave the button off-screen.
    downloadRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [output]);

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

  // The preview shows the active source, so its photo matches and row keys
  // line up; the sheet counts below still cover the whole multi-source job.
  const previewRows = useMemo<DataRow[]>(() => {
    const rows = includeMissingPhotos
      ? excelData.rows
      : excelData.rows.filter((row) => photoMatches.assignments.has(rowKey(row)));
    return rows.slice(0, 8);
  }, [includeMissingPhotos, excelData.rows, photoMatches]);
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
          const photo = photoMatches.assignments.get(rowKey(row));
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
    // Each source is its own job (and its own PDF), so pages are counted per
    // source and summed — a combined row count would undercount the partial
    // sheets at every source boundary.
    const counts = { frontSheets: 0, backSheets: 0, total: 0 };
    for (const source of validSources) {
      const match = photoMatchBySource[source.id] ?? photoMatches;
      const rows = includeMissingPhotos
        ? source.rows.length
        : source.rows.filter((row) => match.assignments.has(rowKey(row))).length;
      const sourceCounts = countJobSheets(
        layout,
        hasFront ? rows : 0,
        hasBack ? rows : 0,
        imposition.arrangement
      );
      counts.frontSheets += sourceCounts.frontSheets;
      counts.backSheets += sourceCounts.backSheets;
      counts.total += sourceCounts.total;
    }
    return { layout, counts, hasFront, hasBack };
  }, [
    isPreviewActive,
    imposition,
    exactCardSizePt,
    project.front,
    project.back,
    options.sides,
    validSources,
    includeMissingPhotos,
    photoMatchBySource,
    photoMatches,
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

  /** Save one finished file through the native dialog (v0.7.5) */
  const saveFile = useCallback(async (file: { blob: Blob; fileName: string }) => {
    setSavingFile(file.fileName);
    try {
      const result = await saveExport(file.blob, file.fileName);
      setLastSave({
        fileName: result.fileName,
        path: result.path,
        status: result.status,
        error: result.error,
      });
    } finally {
      setSavingFile(null);
    }
  }, []);

  const start = useCallback(async () => {
    setOutput(null);
    setLastSave(null);
    setControl('running');
    setBatchState({
      control: 'running',
      current: 0,
      total: rowsToProcess.length,
      etaSeconds: 0,
      errors: [],
    });

    const batchOptions: BatchOptions = { ...options, imposition };
    // One run per source: identical columns and mappings, separate photo
    // libraries, separate output names (v0.7.6).
    const batchSources: BatchSource[] = validSources.map((source) => {
      const match = photoMatchBySource[source.id] ?? {
        assignments: new Map(),
        unmatchedRowIndexes: source.rows.map((row) => row.rowIndex),
        unusedPhotoNames: [],
      };
      const rows = includeMissingPhotos
        ? source.rows
        : source.rows.filter((row) => match.assignments.has(rowKey(row)));
      return {
        id: source.id,
        label: source.label,
        baseName: source.baseName,
        data: { columns: source.columns, rows, fileName: source.label },
        photoMatches: match,
      };
    });
    logMessage(
      'info',
      `Batch started: ${rowsToProcess.length} record(s) from ${batchSources.length} source(s)`
    );
    // Stop Windows from sleeping mid-run; the screen may still turn off.
    void setBatchActive(true);
    try {
      await runBatchSources(
        project,
        batchSources,
        mappings,
        batchOptions,
        () => controlRef.current,
        {
          onProgress: (state: BatchState) => {
            setBatchState(state);
            if (state.control !== 'running') setControl(state.control);
          },
          onComplete: (result) => {
            if (result) {
              // A very large sheet job arrives as several numbered PDFs; a
              // normal job arrives as the single file (or ZIP) in `blob`.
              const files = result.parts ?? [
                { blob: result.blob, fileName: result.fileName },
              ];
              setOutput(files);
              // v0.7.6: open the save dialog automatically when generation
              // finishes. The manual Save button stays for re-saving.
              if (files.length === 1 && files[0]) void saveFile(files[0]);
              logMessage('info', `Batch complete: ${result.fileName}`);
            }
            setControl('done');
          },
        }
      );
    } catch (error) {
      // A job-level failure (layout/writer setup) must end the run visibly
      // instead of leaving the panel stuck on "running".
      const message = error instanceof Error ? error.message : 'Unknown generation error';
      logMessage('error', `Batch failed: ${message}`);
      setBatchState({
        control: 'done',
        current: 0,
        total: rowsToProcess.length,
        etaSeconds: 0,
        errors: [{ rowIndex: -1, message }],
      });
      setControl('done');
    } finally {
      void setBatchActive(false);
    }
  }, [
    project,
    rowsToProcess,
    validSources,
    photoMatchBySource,
    includeMissingPhotos,
    mappings,
    options,
    imposition,
    saveFile,
    setBatchState,
    setControl,
  ]);

  /** Export the records with no matched photo as a UTF-8 CSV (v0.7.2). */
  const downloadMissingPhotos = useCallback(() => {
    if (rowsMissingPhoto.length === 0) return;
    const columns = ['Source', ...(validSources[0]?.columns ?? getColumnNames(excelData))];
    const rows = validSources.flatMap((source) => {
      const match = photoMatchBySource[source.id] ?? photoMatches;
      return source.rows
        .filter((row) => !match.assignments.has(rowKey(row)))
        .map((row) => ({ rowIndex: row.rowIndex, values: { Source: source.label, ...row.values } }));
    });
    const csv = toCsv(columns, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    void saveExport(blob, 'missing-photos.csv', 'csv');
  }, [excelData, rowsMissingPhoto, validSources, photoMatchBySource, photoMatches]);

  const isRunning = control === 'running' || control === 'paused';
  const progress = batchState
    ? batchState.total > 0
      ? (batchState.current / batchState.total) * 100
      : 0
    : 0;

  // Taskbar button progress: the run stays visible while minimized.
  const taskbarStatus = control === 'paused' ? 'paused' : control === 'running' ? 'normal' : 'none';
  useTaskbarProgress(taskbarStatus, progress);

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
          {blockedSources.length > 0 && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <p className="font-medium">Fix the column mismatch before generating.</p>
              <ul className="mt-1 space-y-0.5">
                {blockedSources.map((source) => (
                  <li key={source.id}>{source.error}</li>
                ))}
              </ul>
              <p className="mt-1 text-destructive/80">
                Remove the listed file on Step 1 — the other sources are not processed until it is
                gone.
              </p>
            </div>
          )}
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
                {rowsMissingPhoto.length} of {totalSourceRows} missing
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
              Save missing-photo list ({rowsMissingPhoto.length})
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

          {/* Save: native dialog, one file per generated part (v0.7.5) */}
          {output && output.length > 0 && (
            <div ref={downloadRef} className="mt-3 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                {output.length === 1
                  ? 'Your file is ready. Choose where to save it — the folder is remembered.'
                  : `${output.length} files are ready. Save each one — the folder is remembered.`}
              </p>
              {output.map((file) => (
                <Button
                  key={file.fileName}
                  variant="default"
                  className="w-full"
                  disabled={savingFile !== null}
                  onClick={() => void saveFile(file)}
                >
                  {savingFile === file.fileName ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  Save {file.fileName}
                </Button>
              ))}
              {lastSave && lastSave.status === 'saved' && lastSave.path && (
                <div className="flex items-center justify-between gap-2 rounded-md border bg-surface-card/60 px-2.5 py-2">
                  <p className="min-w-0 flex-1 break-all text-[11px] text-muted-foreground">
                    Saved to <span className="text-foreground">{lastSave.path}</span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (lastSave.path) void revealExportPath(lastSave.path);
                    }}
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Open folder
                  </Button>
                </div>
              )}
              {lastSave && lastSave.status === 'failed' && (
                <p className="text-[11px] text-destructive">
                  Could not save {lastSave.fileName}: {lastSave.error ?? 'unknown error'}
                </p>
              )}
              {lastSave && lastSave.status === 'cancelled' && (
                <p className="text-[11px] text-muted-foreground">
                  Save cancelled — the file is still ready above.
                </p>
              )}
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

      {/* Footer: progress and the run control stay pinned below the scroll area,
          so Generate is next to the progress it starts and the download it
          eventually produces. */}
      <div className="mt-3 shrink-0 border-t pt-3">
        {batchState && (
          <div className="mb-2">
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
                    {error.source ? `${error.source} — ` : ''}
                    {error.rowIndex >= 0 ? `Row ${error.rowIndex + 1}: ` : ''}
                    {error.message}
                  </li>
                ))}
                {batchState.errors.length > 10 && (
                  <li>…and {batchState.errors.length - 10} more</li>
                )}
              </ul>
            )}
          </div>
        )}

        {isRunning && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            Safe to minimize: the run keeps going and the taskbar button shows its progress.
          </p>
        )}

        {isRunning ? (
          <div className="flex gap-1">
            {control === 'running' ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setControl('paused')}
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setControl('running')}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Resume
              </Button>
            )}
            <Button variant="destructive" onClick={() => setControl('cancelled')}>
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            className="w-full"
            onClick={() => void start()}
            disabled={rowsToProcess.length === 0 || blockedSources.length > 0}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Generate {rowsToProcess.length} card(s)
          </Button>
        )}
      </div>
    </section>
  );
}
