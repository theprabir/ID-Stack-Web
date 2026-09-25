import { useState } from 'react';
import type { DataRow } from '@/types/data';
import { useDataStore } from '@/stores/dataStore';
import { ExcelImport, PhotoImport, ColumnMapping, DataPreview } from '@/components/data';

/**
 * Data import page: Excel import → photo import → column mapping →
 * validation preview. (The PSD Studio page composes these with designs.)
 */
export function DataImportPage(): JSX.Element {
  const excelData = useDataStore((state) => state.excelData);
  const mappings = useDataStore((state) => state.mappings);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const selectedRow: DataRow | null =
    selectedRowIndex !== null
      ? (excelData?.rows.find((row) => row.rowIndex === selectedRowIndex) ?? null)
      : null;
  void selectedRow;

  // Placeholder keys come from whatever is currently mapped (generic page).
  const placeholderEntries = Object.entries(mappings).map(([placeholder, column]) => ({
    placeholder,
    column,
  }));

  return (
    <div className="themed-scrollbar h-full overflow-auto p-4">
      <h1 className="mb-4 text-lg font-semibold">Data Import</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ExcelImport />
          <ColumnMapping placeholders={placeholderEntries} excelData={excelData} />
          <DataPreview
            excelData={excelData}
            selectedRowIndex={selectedRowIndex}
            onSelectRow={setSelectedRowIndex}
          />
        </div>

        <div className="flex flex-col gap-4">
          <PhotoImport />
        </div>
      </div>
    </div>
  );
}
