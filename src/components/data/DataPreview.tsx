import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Table2, XCircle } from 'lucide-react';
import type { ExcelData } from '@/types/data';
import { useDataStore, PREVIEW_ROW_COUNT } from '@/stores/dataStore';
import { getPreview } from '@/services/excelService';
import { cn } from '@/lib/utils';

interface DataPreviewProps {
  excelData: ExcelData | null;
  /** Row index selected for the live card preview */
  selectedRowIndex: number | null;
  onSelectRow: (rowIndex: number) => void;
}

/**
 * Validation report + data table. Shows the first rows of imported data,
 * lets the user pick a row for the live card preview and lists all
 * validation issues with severity icons.
 */
export function DataPreview({
  excelData,
  selectedRowIndex,
  onSelectRow,
}: DataPreviewProps): JSX.Element {
  const validation = useDataStore((state) => state.validation);

  const previewRows = useMemo(
    () => (excelData ? getPreview(excelData, PREVIEW_ROW_COUNT) : []),
    [excelData]
  );

  const errorCount = validation?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningCount =
    validation?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;

  if (!excelData) {
    return (
      <section className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground transition-colors duration-300">
        Import an Excel file to preview data.
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="data-preview-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <Table2 className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="data-preview-title" className="text-sm font-semibold">
          Data &amp; Validation
        </h2>
      </div>

      {/* Validation summary */}
      {validation && (
        <div className="mb-3" role="status">
          {validation.valid && warningCount === 0 ? (
            <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              All {validation.validRowIndexes.length} rows valid.
            </p>
          ) : (
            <ul className="themed-scrollbar max-h-32 space-y-1 overflow-auto rounded-md border bg-surface-card p-2 text-xs">
              {validation.valid ? (
                <li className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                    aria-hidden="true"
                  />
                  No errors — {warningCount} warning(s).
                </li>
              ) : (
                <li className="flex items-center gap-1.5 font-medium text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {errorCount} error(s), {warningCount} warning(s) — fix errors before generating.
                </li>
              )}
              {validation.issues.slice(0, 20).map((issue, index) => (
                <li
                  key={`${issue.code}-${issue.rowIndex ?? 'x'}-${issue.columnName ?? 'y'}-${index}`}
                  className={cn(
                    'flex items-start gap-1.5',
                    issue.severity === 'error'
                      ? 'text-destructive'
                      : 'text-amber-600 dark:text-amber-400'
                  )}
                >
                  {issue.severity === 'error' ? (
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                  <span>{issue.message}</span>
                </li>
              ))}
              {validation.issues.length > 20 && (
                <li className="text-muted-foreground">
                  …and {validation.issues.length - 20} more issue(s)
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Data table */}
      <div className="themed-scrollbar overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-surface-card">
            <tr className="text-left">
              <th
                className="px-2 py-1.5 font-medium text-muted-foreground"
                aria-label="Select row for preview"
              />
              {excelData.columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row) => (
              <tr
                key={row.rowIndex}
                onClick={() => onSelectRow(row.rowIndex)}
                className={cn(
                  'cursor-pointer border-t transition-colors',
                  row.rowIndex === selectedRowIndex ? 'bg-primary/10' : 'hover:bg-accent/5'
                )}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="radio"
                    name="preview-row"
                    aria-label={`Preview row ${row.rowIndex + 1}`}
                    checked={row.rowIndex === selectedRowIndex}
                    onChange={() => onSelectRow(row.rowIndex)}
                    className="h-3 w-3 accent-[hsl(var(--primary))]"
                  />
                </td>
                {excelData.columns.map((column) => (
                  <td
                    key={column}
                    className="max-w-32 truncate px-2 py-1.5"
                    title={row.values[column]}
                  >
                    {row.values[column] || <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Click a row to preview that card in the live preview.
      </p>
    </section>
  );
}
