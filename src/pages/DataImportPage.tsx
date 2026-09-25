import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataRow } from '@/types/data';
import { useDataStore } from '@/stores/dataStore';
import { useTemplateStore } from '@/stores/templateStore';
import {
  ExcelImport,
  PhotoImport,
  ColumnMapping,
  DataPreview,
  CardLivePreview,
} from '@/components/data';

/**
 * Data import page: Excel import → photo import → column mapping →
 * validation preview, with a live card preview of the selected row.
 */
export function DataImportPage(): JSX.Element {
  const { t } = useTranslation();
  const excelData = useDataStore((state) => state.excelData);
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [previewSide] = useState<'front' | 'back'>('front');

  const selectedRow: DataRow | null =
    selectedRowIndex !== null
      ? (excelData?.rows.find((row) => row.rowIndex === selectedRowIndex) ?? null)
      : null;

  return (
    <div className="themed-scrollbar h-full overflow-auto p-4">
      <h1 className="mb-4 text-lg font-semibold">{t('data.pageTitle')}</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ExcelImport />
          <ColumnMapping template={currentTemplate} excelData={excelData} />
          <DataPreview
            excelData={excelData}
            selectedRowIndex={selectedRowIndex}
            onSelectRow={setSelectedRowIndex}
          />
        </div>

        <div className="flex flex-col gap-4">
          <CardLivePreview row={selectedRow} side={previewSide} widthPx={360} />
          <PhotoImport />
        </div>
      </div>
    </div>
  );
}
