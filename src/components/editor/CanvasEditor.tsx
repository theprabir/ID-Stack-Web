import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useTemplateStore } from '@/stores/templateStore';
import type { UseCanvasResult } from '@/hooks/useCanvas';
import { CanvasZoom } from './CanvasZoom';
import { formatLength } from '@/utils/units';
import { useSettingsStore } from '@/stores/settingsStore';

interface CanvasEditorProps {
  /** Shared canvas API from the page (single source of truth). */
  canvasApi: UseCanvasResult;
}

/**
 * The scrollable canvas viewport hosting the Fabric.js editing surface.
 * Implements Spacebar+drag temporary panning and middle-click panning.
 */
export function CanvasEditor({ canvasApi }: CanvasEditorProps): JSX.Element {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
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

  // Spacebar temporary pan (Photoshop-style): scroll the viewport with drag.
  useEffect(() => {
    let isSpaceDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    const isEditorTarget = (event: KeyboardEvent): boolean => {
      const target = event.target as HTMLElement | null;
      return !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      );
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat || !isEditorTarget(event)) return;
      // Ctrl+Space is temporary zoom-in; leave it to the shortcut handler.
      if (event.ctrlKey || event.metaKey) return;
      isSpaceDown = true;
      if (viewportRef.current) {
        viewportRef.current.style.cursor = 'grab';
      }
      event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      isSpaceDown = false;
      isDragging = false;
      if (viewportRef.current) {
        viewportRef.current.style.cursor = '';
      }
    };

    const onMouseDown = (event: MouseEvent): void => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      // Middle-click pan (button 1) anywhere, or spacebar+left-click pan.
      if (event.button === 1 || (event.button === 0 && isSpaceDown)) {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        startScrollLeft = viewport.scrollLeft;
        startScrollTop = viewport.scrollTop;
        viewport.style.cursor = 'grabbing';
        event.preventDefault();
      }
    };

    const onMouseMove = (event: MouseEvent): void => {
      const viewport = viewportRef.current;
      if (!isDragging || !viewport) return;
      viewport.scrollLeft = startScrollLeft - (event.clientX - startX);
      viewport.scrollTop = startScrollTop - (event.clientY - startY);
    };

    const onMouseUp = (): void => {
      isDragging = false;
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.style.cursor = isSpaceDown ? 'grab' : '';
      }
    };

    const viewport = viewportRef.current;
    viewport?.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      viewport?.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Middle-click default prevention inside the viewport.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onAuxClick = (event: MouseEvent): void => {
      if (event.button === 1) event.preventDefault();
    };
    viewport.addEventListener('auxclick', onAuxClick);
    return () => viewport.removeEventListener('auxclick', onAuxClick);
  }, []);

  void fabric; // keep import for potential viewport transforms

  const side = currentTemplate?.[currentSide === 'front' ? 'frontSide' : 'backSide'];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={viewportRef}
        className="themed-scrollbar flex flex-1 items-center justify-center overflow-auto bg-surface-canvas p-8 transition-colors duration-300"
      >
        <div className="rounded-md shadow-lg ring-1 ring-border" style={{ lineHeight: 0 }}>
          <canvas ref={canvasElementRef} aria-label="Template design canvas" />
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
