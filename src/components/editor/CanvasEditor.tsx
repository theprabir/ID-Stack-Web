import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTemplateStore } from '@/stores/templateStore';
import type { UseCanvasResult } from '@/hooks/useCanvas';
import { CanvasZoom } from './CanvasZoom';
import { formatLength } from '@/utils/units';
import { useSettingsStore } from '@/stores/settingsStore';

interface CanvasEditorProps {
  /** Shared canvas API from the page (single source of truth). */
  canvasApi: UseCanvasResult;
}

/** The scrollable canvas viewport hosting the Fabric.js editing surface. */
export function CanvasEditor({ canvasApi }: CanvasEditorProps): JSX.Element {
  const { t } = useTranslation();
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const { attachCanvas } = canvasApi;
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const currentSide = useTemplateStore((state) => state.currentSide);
  const unit = useSettingsStore((state) => state.unit);

  // Attach Fabric once the <canvas> mounts.
  useEffect(() => {
    if (canvasElementRef.current) {
      attachCanvas(canvasElementRef.current);
    }
  }, [attachCanvas]);

  const side = currentTemplate?.[currentSide === 'front' ? 'frontSide' : 'backSide'];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="themed-scrollbar flex flex-1 items-center justify-center overflow-auto bg-surface-canvas p-8 transition-colors duration-300">
        <div className="rounded-md shadow-lg ring-1 ring-border" style={{ lineHeight: 0 }}>
          <canvas ref={canvasElementRef} aria-label={t('editor.canvasLabel')} />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3">
        <div className="pointer-events-auto">
          <CanvasZoom />
        </div>
        {side && (
          <span className="rounded-md border bg-surface-panel px-2 py-1 text-xs text-muted-foreground transition-colors duration-300">
            {formatLength(side.canvasWidth, unit)} × {formatLength(side.canvasHeight, unit)}
          </span>
        )}
      </div>
    </div>
  );
}
