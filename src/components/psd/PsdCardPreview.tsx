import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import type { SideType } from '@/types/psd';
import type { DataRow } from '@/types/data';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { compositeDesign } from '@/services/psdCompositeService';
import { LoadingSpinner } from '@/components/common';

interface PsdCardPreviewProps {
  side: SideType;
  row: DataRow | null;
  /** Display width in px */
  widthPx?: number;
}

/**
 * Live preview of the composited PSD design for one row: placeholders get
 * row data/photos, everything else stays pixel-identical to the design.
 */
export function PsdCardPreview({ side, row, widthPx = 320 }: PsdCardPreviewProps): JSX.Element {
  const design = usePsdStore((state) => state.project[side]);
  const placeholders = usePsdStore((state) => state.project.placeholders);
  const mappings = useDataStore((state) => state.mappings);
  const photoMatchResult = useDataStore((state) => state.photoMatchResult);
  const photos = useDataStore((state) => state.photos);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!design) return;
    let cancelled = false;

    const render = async (): Promise<void> => {
      try {
        const photo = row ? photoMatchResult?.assignments.get(row.rowIndex) : undefined;
        const rendered = await compositeDesign(design, {
          placeholders: placeholders.filter((placeholder) => placeholder.side === side),
          mappings,
          row,
          getPhoto: () => photo,
        });
        if (!cancelled) {
          setCanvas(rendered);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Preview failed');
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [design, side, row, mappings, photoMatchResult, placeholders, photos]);

  if (!design) {
    return (
      <section className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground transition-colors duration-300">
        Upload the {side} design to preview it.
      </section>
    );
  }

  const sideLabel = side === 'front' ? 'Front' : 'Back';

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby={`psd-preview-${side}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id={`psd-preview-${side}`} className="text-sm font-semibold">
          Live Preview — {sideLabel}
        </h2>
      </div>

      <div className="flex justify-center rounded-md bg-surface-canvas p-4 transition-colors duration-300">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : canvas ? (
          <canvas
            ref={(node) => {
              if (node && canvas) {
                const context = node.getContext('2d');
                node.width = canvas.width;
                node.height = canvas.height;
                context?.drawImage(canvas, 0, 0);
              }
            }}
            role="img"
            aria-label={`${sideLabel} preview`}
            className="h-auto max-w-full rounded shadow-md"
            style={{ maxWidth: widthPx }}
          />
        ) : (
          <LoadingSpinner />
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {row ? `Showing row ${row.rowIndex + 1}` : 'Select a row to see live data'}
      </p>
    </section>
  );
}
