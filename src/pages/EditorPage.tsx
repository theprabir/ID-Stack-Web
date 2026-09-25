import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement, CardTemplate } from '@/types/template';
import { sideKey } from '@/types/template';
import type { ToolType } from '@/constants/canvas';
import { useTemplateStore } from '@/stores/templateStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useHistory } from '@/hooks/useHistory';
import { useCanvas } from '@/hooks/useCanvas';
import {
  CanvasEditor,
  CanvasToolbar,
  TemplateTabs,
  ToolsPanel,
  LayersPanel,
  PropertiesPanel,
} from '@/components/editor';
import { LoadingSpinner } from '@/components/common';

/**
 * Template editor page: Photoshop-like layout with tools rail, canvas,
 * layers and properties panels, dual-sided tabs and undo/redo history.
 */
export function EditorPage(): JSX.Element {
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const createTemplate = useTemplateStore((state) => state.createTemplate);
  const saveTemplate = useTemplateStore((state) => state.saveTemplate);
  const isModified = useTemplateStore((state) => state.isModified);
  const isLoading = useTemplateStore((state) => state.isLoading);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);

  const history = useHistory();
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(null);
  const initializedRef = useRef(false);

  /** Push committed canvas changes into history. */
  const handleCanvasChange = useCallback(
    (template: CardTemplate, label: string) => {
      history.pushState(template, label);
    },
    [history]
  );

  const canvasApi = useCanvas(handleCanvasChange);

  // Create a starter template on first visit.
  useEffect(() => {
    if (!initializedRef.current && !currentTemplate && !isLoading) {
      initializedRef.current = true;
      createTemplate('Untitled template');
    }
  }, [currentTemplate, isLoading, createTemplate]);

  // Seed history once a template exists.
  useEffect(() => {
    if (currentTemplate && history.labels.length === 0) {
      history.reset(currentTemplate);
    }
  }, [currentTemplate, history]);

  /** Undo: restore previous snapshot into the store + canvas. */
  const handleUndo = useCallback(() => {
    const previous = history.undo();
    if (previous) {
      const side = previous[sideKey(useTemplateStore.getState().currentSide)];
      void canvasApi.loadSide(side);
      useTemplateStore.setState({ currentTemplate: previous, isModified: true });
    }
  }, [history, canvasApi]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (next) {
      const side = next[sideKey(useTemplateStore.getState().currentSide)];
      void canvasApi.loadSide(side);
      useTemplateStore.setState({ currentTemplate: next, isModified: true });
    }
  }, [history, canvasApi]);

  /**
   * Keyboard shortcuts (Photoshop-style, implemented features only —
   * see docs/keyboard_shortcuts.md).
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (isTyping) return;

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const zoom = useCanvasStore.getState().zoom;

      // ---- Tool pickers (single keys, Photoshop-style) ----
      if (!modifier && !event.altKey && !event.shiftKey) {
        const toolKeys: Record<string, ToolType> = {
          v: 'select',
          t: 'text',
          u: 'shape',
          h: 'pan',
        };
        const tool = toolKeys[key];
        if (tool) {
          useCanvasStore.getState().setTool(tool);
          return;
        }
      }

      // ---- Zoom & view ----
      if (modifier && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        useCanvasStore.getState().setZoom(Math.round((zoom + 0.1) * 10) / 10);
        return;
      }
      if (modifier && event.key === '-') {
        event.preventDefault();
        useCanvasStore.getState().setZoom(Math.round((zoom - 0.1) * 10) / 10);
        return;
      }
      if (modifier && key === '0') {
        event.preventDefault();
        useCanvasStore.getState().resetZoom();
        return;
      }
      if (modifier && key === '1') {
        event.preventDefault();
        useCanvasStore.getState().setZoom(1);
        return;
      }

      // ---- File ----
      if (modifier && key === 's' && !event.shiftKey) {
        event.preventDefault();
        void saveTemplate();
        return;
      }

      // ---- History ----
      if (modifier && key === 'z' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if ((modifier && key === 'y') || (modifier && event.shiftKey && key === 'z')) {
        event.preventDefault();
        handleRedo();
        return;
      }

      // ---- Selection ----
      if (modifier && key === 'a' && !event.altKey) {
        event.preventDefault();
        canvasApi.selectAll();
        return;
      }
      if (modifier && key === 'd') {
        event.preventDefault();
        canvasApi.deselectAll();
        useCanvasStore.getState().clearSelection();
        return;
      }

      // ---- Layer ordering ----
      if (modifier && event.key === ']' && !event.shiftKey) {
        event.preventDefault();
        canvasApi.bringForward();
        return;
      }
      if (modifier && event.key === ']' && event.shiftKey) {
        event.preventDefault();
        canvasApi.bringToFront();
        return;
      }
      if (modifier && event.key === '[' && !event.shiftKey) {
        event.preventDefault();
        canvasApi.sendBackward();
        return;
      }
      if (modifier && event.key === '[' && event.shiftKey) {
        event.preventDefault();
        canvasApi.sendToBack();
        return;
      }

      // ---- Nudge (arrow keys; Shift = 10 px) ----
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const deltas: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const delta = deltas[event.key];
        if (delta) canvasApi.nudgeSelected(delta[0], delta[1]);
        return;
      }

      // ---- Delete / cancel ----
      if (event.key === 'Delete' || event.key === 'Backspace') {
        canvasApi.deleteSelected();
        return;
      }
      if (event.key === 'Escape') {
        canvasApi.deselectAll();
        useCanvasStore.getState().clearSelection();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, canvasApi, saveTemplate]);

  /** Pick the selected element object from the store for the properties panel. */
  const pickSelectedElement = useCallback((element: CanvasElement) => {
    setSelectedElement(element);
    useCanvasStore.getState().selectElement(element.id);
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!currentTemplate) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const canSave = isModified;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <CanvasToolbar
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDelete={() => canvasApi.deleteSelected()}
          onBringToFront={canvasApi.bringToFront}
          onSendToBack={canvasApi.sendToBack}
        />
        <ToolsPanel
          onAddElement={canvasApi.addElementFromData}
          onSave={() => void saveTemplate()}
          canSave={canSave}
        />
        <CanvasEditor canvasApi={canvasApi} /> <PropertiesPanel element={selectedElement} />
        <LayersPanel
          selectedElementId={selectedElementIds[0] ?? null}
          onSelect={pickSelectedElement}
          onReorder={canvasApi.reorderElement}
        />
      </div>
      <TemplateTabs />
    </div>
  );
}
