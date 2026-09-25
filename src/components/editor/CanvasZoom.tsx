import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { Button } from '@/components/ui';

/** Bottom-left zoom controls for the canvas viewport. */
export function CanvasZoom(): JSX.Element {
  const zoom = useCanvasStore((state) => state.zoom);
  const zoomIn = useCanvasStore((state) => state.zoomIn);
  const zoomOut = useCanvasStore((state) => state.zoomOut);
  const resetZoom = useCanvasStore((state) => state.resetZoom);

  return (
    <div className="flex items-center gap-1 rounded-md border bg-surface-panel p-1 shadow-sm transition-colors duration-300">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={zoomOut}
      >
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </Button>
      <button
        type="button"
        onClick={resetZoom}
        title="Reset zoom"
        className="min-w-14 rounded px-1 text-xs font-medium text-foreground hover:underline"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={zoomIn}
      >
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Reset zoom"
        aria-label="Reset zoom"
        onClick={resetZoom}
      >
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
