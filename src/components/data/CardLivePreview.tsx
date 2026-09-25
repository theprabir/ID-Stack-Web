import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import type { DataRow } from '@/types/data';
import { sideKey } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';
import { useDataStore } from '@/stores/dataStore';
import { renderSidePreview, clearPreviewImageCache } from '@/services/previewService';
import { LoadingSpinner } from '@/components/common';

interface CardLivePreviewProps {
  /** Row to render (null shows the raw template) */
  row: DataRow | null;
  /** Which side to show */
  side: 'front' | 'back';
  /** Display width in px (scales mm→px internally) */
  widthPx?: number;
}

/**
 * Live card preview: renders one side of the current template with the
 * selected data row applied (placeholders substituted, photo placed).
 * Re-renders when template, mappings, row or side change.
 */
export function CardLivePreview({ row, side, widthPx = 320 }: CardLivePreviewProps): JSX.Element {
  const { t } = useTranslation();
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const mappings = useDataStore((state) => state.mappings);
  const photoMatchResult = useDataStore((state) => state.photoMatchResult);
  const photos = useDataStore((state) => state.photos);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearPreviewImageCache();
  }, [photos]);

  useEffect(() => {
    if (!currentTemplate) return;
    let cancelled = false;

    const render = async (): Promise<void> => {
      try {
        const photo = row ? photoMatchResult?.assignments.get(row.rowIndex) : undefined;
        const rendered = await renderSidePreview(currentTemplate, side, row, mappings, {
          scale: (widthPx / currentTemplate[sideKey(side)].canvasWidth) * (300 / 96),
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
  }, [currentTemplate, side, row, mappings, photoMatchResult, widthPx]);

  if (!currentTemplate) {
    return (
      <section className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground transition-colors duration-300">
        {t('data.previewNeedsTemplate')}
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="card-preview-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="card-preview-title" className="text-sm font-semibold">
          {t('data.livePreviewTitle', {
            side: t(side === 'front' ? 'editor.frontSide' : 'editor.backSide'),
          })}
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
            aria-label={t('data.livePreviewTitle', { side })}
            className="h-auto w-full max-w-full rounded shadow-md"
            style={{ maxWidth: widthPx }}
          />
        ) : (
          <LoadingSpinner />
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {row ? t('data.livePreviewRow', { row: row.rowIndex + 1 }) : t('data.livePreviewNoRow')}
      </p>
    </section>
  );
}
