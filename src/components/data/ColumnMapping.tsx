import { useMemo } from 'react';
import { ArrowLeftRight, Wand2 } from 'lucide-react';
import type { ExcelData, ColumnMapping } from '@/types/data';
import { useDataStore } from '@/stores/dataStore';
import { getPreview } from '@/services/excelService';
import { Button, Select } from '@/components/ui';

interface ColumnMappingProps {
  /** Placeholder → current column pairs to display */
  placeholders: ColumnMapping[];
  excelData: ExcelData | null;
}

/**
 * Column mapping interface: placeholders on the left, Excel columns on the
 * right with sample data, auto-map button. Unmapped placeholders are
 * visually flagged. Works for PSD placeholder keys (lowercase match).
 */
export function ColumnMapping({ placeholders, excelData }: ColumnMappingProps): JSX.Element {
  const setMapping = useDataStore((state) => state.setMapping);
  const autoMapColumns = useDataStore((state) => state.autoMapColumns);

  const sampleRows = useMemo(() => (excelData ? getPreview(excelData, 2) : []), [excelData]);

  if (!excelData) {
    return (
      <section className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground transition-colors duration-300">
        Import an Excel file to map placeholders.
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="column-mapping-title"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="column-mapping-title" className="text-sm font-semibold">
            Column Mapping
          </h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={autoMapColumns}
          disabled={placeholders.length === 0}
        >
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Auto-map
        </Button>
      </div>

      {placeholders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No placeholders chosen. Pick text or photo layers from the design first.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Placeholder</th>
                <th className="py-2 pr-3 font-medium">Excel column</th>
                <th className="py-2 font-medium">Sample</th>
              </tr>
            </thead>
            <tbody>
              {placeholders.map(({ placeholder, column: mappedColumn }) => {
                const sample = mappedColumn ? (sampleRows[0]?.values[mappedColumn] ?? '—') : '—';
                return (
                  <tr key={placeholder} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <code
                        className={
                          mappedColumn
                            ? 'rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary'
                            : 'rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive'
                        }
                      >
                        {`{{${placeholder}}}`}
                      </code>
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        aria-label={`Map placeholder ${placeholder}`}
                        className="h-8 min-w-40 text-xs"
                        value={mappedColumn}
                        onChange={(event) => setMapping(placeholder, event.target.value)}
                      >
                        <option value="">Not mapped</option>
                        {excelData.columns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td
                      className="max-w-40 truncate py-2 text-xs text-muted-foreground"
                      title={sample}
                    >
                      {sample}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
