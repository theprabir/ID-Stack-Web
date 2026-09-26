import { useMemo, useState } from 'react';
import type { DataRow } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore, PREVIEW_ROW_COUNT } from '@/stores/dataStore';
import { matchPhotos } from '@/services/photoService';
import { getPreview } from '@/services/excelService';
import {
  PsdUploader,
  LayerPicker,
  PsdCardPreview,
  BatchRunner,
  FontManager,
} from '@/components/psd';
import { StudioStepper, StudioNavButtons, type StudioStep } from '@/components/psd/StudioStepper';
import { ExcelImport, PhotoImport, DataPreview } from '@/components/data';
import { ColumnMapping } from '@/components/data/ColumnMapping';
import { cn } from '@/lib/utils';

/** Total wizard steps in the PSD Studio */
const TOTAL_STEPS = 3;

const STEPS: StudioStep[] = [
  {
    number: 1,
    label: 'Upload Designs & Data',
    description: 'Upload PSD designs, import the Excel sheet and the photos',
  },
  {
    number: 2,
    label: 'Choose Placeholders',
    description: 'Pick the text and photo layers that change per card',
  },
  {
    number: 3,
    label: 'Generate',
    description: 'Map columns, preview, then generate cards or printable sheets',
  },
];

/**
 * PSD Studio — a 3-step wizard:
 * 1. Upload designs & data (PSD front/back + Excel + photos)
 * 2. Choose placeholders (text/photo layers per side)
 * 3. Generate (mapping, live preview, batch output as ZIP or imposed sheets)
 *
 * All step panels stay mounted (hidden when inactive) so nothing is lost
 * while navigating back and forth; the underlying stores keep their state.
 */
export function PsdStudioPage(): JSX.Element {
  const project = usePsdStore((state) => state.project);
  const isParsing = usePsdStore((state) => state.isParsing);
  const excelData = useDataStore((state) => state.excelData);
  const mappings = useDataStore((state) => state.mappings);
  const photoMatchConfig = useDataStore((state) => state.photoMatchConfig);
  const photos = useDataStore((state) => state.photos);
  const [step, setStep] = useState(1);
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

  // Step gates: what must be ready to move forward.
  const designsReady = Boolean(project.front || project.back);
  const placeholdersReady = project.placeholders.length > 0;
  const dataReady = Boolean(excelData && excelData.rows.length > 0);
  const readyToGenerate = designsReady && placeholdersReady && dataReady;

  // Highest step reachable right now (used for chip clicking and Next).
  const maxReachableStep = !designsReady && !dataReady ? 1 : placeholdersReady ? 3 : 2;

  const step1Blocked =
    !designsReady && !dataReady
      ? 'Upload at least one design or an Excel sheet to continue.'
      : null;
  const step2Blocked = !placeholdersReady
    ? 'Choose at least one placeholder layer to continue.'
    : null;

  return (
    <div className="themed-scrollbar h-full overflow-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">PSD Studio</h1>
        <StudioStepper
          steps={STEPS}
          currentStep={step}
          maxReachableStep={maxReachableStep}
          onSelectStep={setStep}
        />
      </div>

      {/* Step 1 — Upload designs, Excel and photos (stays mounted, hidden) */}
      <section hidden={step !== 1} aria-hidden={step !== 1}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PsdUploader side="front" />
              <PsdUploader side="back" />
            </div>
            <ExcelImport />
          </div>
          <div className="flex flex-col gap-4">
            <PhotoImport />
            <FontManager />
          </div>
        </div>
        <div className="mt-4">
          <StudioNavButtons
            currentStep={1}
            totalSteps={TOTAL_STEPS}
            canProceed={designsReady || dataReady}
            blockedReason={step1Blocked}
            onBack={() => setStep(1)}
            onNext={() => setStep(2)}
          />
        </div>
      </section>

      {/* Step 2 — Choose placeholders (stays mounted, hidden) */}
      <section hidden={step !== 2} aria-hidden={step !== 2}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <LayerPicker side="front" />
          <LayerPicker side="back" />
        </div>
        <div className="mt-4">
          <StudioNavButtons
            currentStep={2}
            totalSteps={TOTAL_STEPS}
            canProceed={placeholdersReady}
            blockedReason={step2Blocked}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        </div>
      </section>

      {/* Step 3 — Generate (stays mounted, hidden) */}
      <section hidden={step !== 3} aria-hidden={step !== 3}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Left: mapping + data table */}
          <div className="flex flex-col gap-4">
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
          </div>

          {/* Right: live preview + batch generation */}
          <div className="flex flex-col gap-4">
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
              <div className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground">
                Complete the earlier steps to unlock generation.
              </div>
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
        <div className="mt-4">
          <StudioNavButtons
            currentStep={3}
            totalSteps={TOTAL_STEPS}
            canProceed
            blockedReason={null}
            onBack={() => setStep(2)}
            onNext={() => setStep(3)}
          />
        </div>
      </section>

      {isParsing && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Parsing design…
        </p>
      )}
    </div>
  );
}
