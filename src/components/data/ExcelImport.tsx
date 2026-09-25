import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X, Loader2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Excel/CSV import card: file picker + drag-drop, parse status,
 * file info and a clear button.
 */
export function ExcelImport(): JSX.Element {
  const excelData = useDataStore((state) => state.excelData);
  const isParsing = useDataStore((state) => state.isParsing);
  const parseError = useDataStore((state) => state.parseError);
  const loadExcel = useDataStore((state) => state.loadExcel);
  const clearExcel = useDataStore((state) => state.clearExcel);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadExcel(file);
    },
    [loadExcel]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="excel-import-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="excel-import-title" className="text-sm font-semibold">
          Excel Data
        </h2>
      </div>

      {!excelData && !isParsing && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Click to choose a file or drop it here"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-accent/5'
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">Click to choose a file or drop it here</p>
          <p className="text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv</p>
        </div>
      )}

      {isParsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {excelData && !isParsing && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-surface-card px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={excelData.fileName}>
              {excelData.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {excelData.rows.length} rows · {excelData.columns.length} columns
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove Excel data"
              title="Remove Excel data"
              onClick={clearExcel}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {parseError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {parseError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
