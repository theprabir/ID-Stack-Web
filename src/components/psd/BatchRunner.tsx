import { useCallback, useRef, useState } from 'react';
import { Play, Pause, Square, Download, Loader2 } from 'lucide-react';
import type { PsdProject } from '@/types/psd';
import type { ExcelData, PhotoMatchResult } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { runBatch, type BatchOptions, type BatchState } from '@/services/batchService';
import { Button, Input, Select, Label } from '@/components/ui';

interface BatchRunnerProps {
  project: PsdProject;
  excelData: ExcelData;
  photoMatches: PhotoMatchResult;
}

/**
 * Batch generation panel: output options, run/pause/resume/cancel,
 * live progress with ETA and error list, ZIP download when done.
 */
export function BatchRunner({ project, excelData, photoMatches }: BatchRunnerProps): JSX.Element {
  const control = usePsdStore((state) => state.batchControl);
  const batchState = usePsdStore((state) => state.batchState);
  const setBatchControl = usePsdStore((state) => state.setBatchControl);
  const setBatchState = usePsdStore((state) => state.setBatchState);
  const mappings = useDataStore((state) => state.mappings);

  const [options, setOptions] = useState<BatchOptions>({
    format: 'png',
    quality: 0.92,
    naming: '{Name}_{Row}',
    sides: 'both',
  });
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const controlRef = useRef<'running' | 'paused' | 'cancelled' | 'done'>('done');

  const setControl = useCallback(
    (value: 'running' | 'paused' | 'cancelled' | 'done') => {
      controlRef.current = value;
      setBatchControl(value);
    },
    [setBatchControl]
  );

  const start = useCallback(async () => {
    setZipUrl(null);
    setControl('running');
    setBatchState({
      control: 'running',
      current: 0,
      total: excelData.rows.length,
      etaSeconds: 0,
      errors: [],
    });

    await runBatch(project, excelData, mappings, photoMatches, options, () => controlRef.current, {
      onProgress: (state: BatchState) => {
        setBatchState(state);
        if (state.control !== 'running') setControl(state.control);
      },
      onComplete: (zip) => {
        setIsZipping(false);
        if (zip) {
          const url = URL.createObjectURL(zip);
          setZipUrl(url);
        }
        setControl('done');
      },
    });
  }, [project, excelData, mappings, photoMatches, options, setBatchState, setControl]);

  const isRunning = control === 'running' || control === 'paused';
  const progress = batchState
    ? batchState.total > 0
      ? (batchState.current / batchState.total) * 100
      : 0
    : 0;

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="batch-runner-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <Play className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="batch-runner-title" className="text-sm font-semibold">
          Generate Cards
        </h2>
      </div>

      {/* Options */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label htmlFor="batch-format" className="mb-1 block text-xs text-muted-foreground">
            Format
          </Label>
          <Select
            id="batch-format"
            value={options.format}
            disabled={isRunning}
            onChange={(event) =>
              setOptions((current) => ({ ...current, format: event.target.value as 'png' | 'jpg' }))
            }
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
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
              disabled={excelData.rows.length === 0}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Generate {excelData.rows.length} card(s)
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      {batchState && (
        <div className="mb-3">
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
              {batchState.errors.length > 10 && <li>…and {batchState.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}

      {/* Download */}
      {zipUrl && (
        <Button
          variant="default"
          className="w-full"
          onClick={() => {
            const link = document.createElement('a');
            link.href = zipUrl;
            link.download = 'id-cards.zip';
            link.click();
          }}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download ZIP
        </Button>
      )}
    </section>
  );
}
