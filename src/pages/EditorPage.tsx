import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CanvasElement, CardTemplate } from '@/types/template';
import { sideKey } from '@/types/template';
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
  const { t } = useTranslation();
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const currentSide = useTemplateStore((state) => state.currentSide);
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
      createTemplate(t('editor.untitled'));
    }
  }, [currentTemplate, isLoading, createTemplate, t]);

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

  /** Keyboard shortcuts (Design.md list). */
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (isTyping) return;

      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (
        (modifier && event.key.toLowerCase() === 'y') ||
        (modifier && event.shiftKey && event.key.toLowerCase() === 'z')
      ) {
        event.preventDefault();
        handleRedo();
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveTemplate();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        canvasApi.deleteSelected();
      } else if (event.key === 'Escape') {
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
        <CanvasEditor canvasApi={canvasApi} />
        <PropertiesPanel element={selectedElement} />
        <LayersPanel
          selectedElementId={selectedElementIds[0] ?? null}
          onSelect={pickSelectedElement}
        />
      </div>
      <TemplateTabs />
      <span className="sr-only" aria-live="polite">
        {t('editor.sideActive', { side: currentSide })}
      </span>
    </div>
  );
}
