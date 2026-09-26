import { useMemo, useState } from 'react';
import type { DataRow } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore, PREVIEW_ROW_COUNT } from '@/stores/dataStore';
import { matchPhotos } from '@/services/photoService';
import { getPreview } from '@/services/excelService';
import { PsdUploader, LayerPicker, PsdCardPreview, BatchRunner, FontManager } from '@/components/psd';
import { DataPreview } from '@/components/data';
import { ColumnMapping } from '@/components/data/ColumnMapping';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * PSD Studio — the main production pipeline:
 * 1. Upload front/back PSD designs
 * 2. Choose placeholder layers (text/photo)
 * 3. Import Excel + photos, map columns to placeholders
 * 4. Preview live, then generate the full batch as a ZIP
 */
export function PsdStudioPage(): JSX.Element {
  const project = usePsdStore((state) => state.project);
  const isParsing = usePsdStore((state) => state.isParsing);
  const excelData = useDataStore((state) => state.excelData);
  const mappings = useDataStore((state) => state.mappings);
  const photoMatchConfig = useDataStore((state) => state.photoMatchConfig);
  const photos = useDataStore((state) => state.photos);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  // Photo matching derived from the shared data store.
  const photoMatches = useMemo(
    () => (excelData ? matchPhotos(excelData.rows, photos, photoMatchConfig) : null),
    [excelData, photos, photoMatchConfig]
  );

  const selectedRow: DataRow | null =
    selectedRowIndex !== null
      ? (excelData?.rows.find((row) => row.rowIndex === selectedRowIndex) ?? null)
      : null;

  const sampleRows = useMemo(
    () => (excelData ? getPreview(excelData, PREVIEW_ROW_COUNT) : []),
    [excelData]
  );

  const readyToGenerate = Boolean(
    project.front && project.placeholders.length > 0 && excelData && excelData.rows.length > 0
  );

  const steps = [
    { label: 'Upload designs', done: Boolean(project.front || project.back) },
    {
      label: 'Choose placeholders',
      done: project.placeholders.length > 0,
    },
    { label: 'Import data', done: Boolean(excelData) },
    { label: 'Generate', done: false },
  ];
  const currentStep = steps.findIndex((step) => !step.done);

  return (
    <div className="themed-scrollbar h-full overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">PSD Studio</h1>
        {/* Step indicator */}
        <ol className="flex items-center gap-2 text-xs" aria-label="Workflow progress">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                step.done
                  ? 'border-green-500/40 text-green-600 dark:text-green-400'
                  : index === currentStep
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'text-muted-foreground'
              )}
            >
              <span className="font-medium">{index + 1}.</span>
              {step.label}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Left column: design + layers */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PsdUploader side="front" />
            <PsdUploader side="back" />
          </div>

          <LayerPicker side="front" />
          <LayerPicker side="back" />
          <FontManager />
        </div>

        {/* Right column: data, mapping, preview, generation */}
        <div className="flex flex-col gap-4">
          {/* Placeholder → column mapping */}
          {project.placeholders.length > 0 && excelData && (
            <ColumnMapping
              placeholders={project.placeholders.map((placeholder) => ({
                placeholder: placeholder.key,
                column: mappings[placeholder.key] ?? '',
              }))}
              excelData={excelData}
            />
          )}

          <DataPreview
            excelData={excelData}
            selectedRowIndex={selectedRowIndex}
            onSelectRow={setSelectedRowIndex}
          />

          {/* Live preview with side switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="tab"
              aria-selected={previewSide === 'front'}
              onClick={() => setPreviewSide('front')}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                previewSide === 'front'
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent/10'
              )}
            >
              Front
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewSide === 'back'}
              onClick={() => setPreviewSide('back')}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                previewSide === 'back'
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent/10'
              )}
            >
              Back
            </button>
          </div>
          <PsdCardPreview side={previewSide} row={selectedRow} widthPx={340} />

          {readyToGenerate && excelData && photoMatches ? (
            <BatchRunner project={project} excelData={excelData} photoMatches={photoMatches} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Generate Cards</CardTitle>
                <CardDescription>
                  {!project.front && 'Upload at least the front design. '}
                  {project.placeholders.length === 0 && 'Choose at least one placeholder layer. '}
                  {!excelData && 'Import an Excel sheet with the card data. '}
                  {excelData && excelData.rows.length === 0 && 'The Excel sheet has no data rows. '}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {isParsing ? 'Parsing design…' : 'Complete the steps above to unlock generation.'}
              </CardContent>
            </Card>
          )}

          {/* Sample of mapped rows for quick sanity check */}
          {sampleRows.length > 0 && project.placeholders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sample row keys:{' '}
              {project.placeholders.map((placeholder) => `{{${placeholder.key}}}`).join(' ')} —
              mapped columns: {Object.values(mappings).filter(Boolean).join(', ') || 'none yet'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
