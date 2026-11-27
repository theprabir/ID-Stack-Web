import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X, Loader2, AlertTriangle } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import type { ExcelSource } from '@/types/data';
import { Button, ConfirmDialog } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Excel/CSV import card (v0.7.6): every file and every non-empty sheet becomes
 * its own data source. A file whose columns do not match the first source is
 * listed with the reason and blocks generation until it is removed.
 */
export function ExcelImport(): JSX.Element {
  const sources = useDataStore((state) => state.sources);
  const isParsing = useDataStore((state) => state.isParsing);
  const parseError = useDataStore((state) => state.parseError);
  const importSpreadsheets = useDataStore((state) => state.importSpreadsheets);
  const removeSource = useDataStore((state) => state.removeSource);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ExcelSource | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) void importSpreadsheets(files);
    },
    [importSpreadsheets]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const hasSources = sources.length > 0;

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="excel-import-title"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="excel-import-title" className="text-sm font-semibold">
            Excel Data
          </h2>
        </div>
        {hasSources && (
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Add files
          </Button>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Click to choose Excel files or drop them here"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          hasSources ? 'p-3' : 'p-6',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/5'
        )}
      >
        {isParsing ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <Upload className={hasSources ? 'h-4 w-4 text-muted-foreground' : 'h-6 w-6 text-muted-foreground'} aria-hidden="true" />
        )}
        <p className={hasSources ? 'text-xs' : 'text-sm'}>
          {isParsing
            ? 'Loading…'
            : hasSources
              ? 'Drop more files here (each sheet becomes a separate output)'
              : 'Click to choose files or drop them here'}
        </p>
        {!hasSources && <p className="text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv</p>}
      </div>

      {hasSources && (
        <ul className="mt-3 space-y-1.5" aria-label="Data sources">
          {sources.map((source) => (
            <li
              key={source.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
                source.error ? 'border-destructive/40 bg-destructive/5' : 'bg-surface-card'
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium" title={source.label}>
                  {source.error && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                  )}
                  {source.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {source.error ?? `${source.rows.length} rows · ${source.columns.length} columns`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${source.label}`}
                title={`Remove ${source.label}`}
                onClick={() => setPendingRemoval(source)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Remove "${pendingRemoval?.label ?? ''}"?`}
        description="Its rows, column mappings, photo-library mapping and manual photo picks are discarded for this session. Import the file again to bring it back."
        confirmLabel="Remove source"
        destructive
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          const source = pendingRemoval;
          setPendingRemoval(null);
          if (source) removeSource(source.id);
        }}
      />

      {parseError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {parseError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
