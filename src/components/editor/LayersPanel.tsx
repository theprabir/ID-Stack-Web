import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock, Unlock, Trash2, GripVertical } from 'lucide-react';
import type { CanvasElement } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LayersPanelProps {
  selectedElementId: string | null;
  onSelect: (element: CanvasElement) => void;
  /** Move an element to a new stack index (bottom-based, matches canvas order). */
  onReorder: (elementId: string, toIndex: number) => void;
}

/**
 * Right panel layer list: order (top first), visibility, lock, delete and
 * drag-drop reordering with undo/redo support via the reorder callback.
 */
export function LayersPanel({
  selectedElementId,
  onSelect,
  onReorder,
}: LayersPanelProps): JSX.Element {
  const { t } = useTranslation();
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const currentSide = useTemplateStore((state) => state.currentSide);
  const upsertElement = useTemplateStore((state) => state.upsertElement);
  const removeElement = useTemplateStore((state) => state.removeElement);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Display order: top-most first. Canvas stack index = (count - 1 - displayIndex).
  const elements: CanvasElement[] = currentTemplate
    ? [...currentTemplate[currentSide === 'front' ? 'frontSide' : 'backSide'].elements].reverse()
    : [];

  /** Convert display (top-first) index to canvas stack index. */
  const toStackIndex = useCallback(
    (displayIndex: number): number => Math.max(0, elements.length - 1 - displayIndex),
    [elements.length]
  );

  const handleDrop = useCallback(
    (targetDisplayIndex: number) => {
      if (draggingId && dropTargetIndex !== null) {
        // Dropping "before" the target row (in top-first display order)
        const targetStack = toStackIndex(targetDisplayIndex);
        onReorder(draggingId, targetStack);
      }
      setDraggingId(null);
      setDropTargetIndex(null);
    },
    [draggingId, dropTargetIndex, onReorder, toStackIndex]
  );

  if (!currentTemplate) {
    return (
      <div className="w-64 border-l bg-surface-panel p-3 text-sm text-muted-foreground transition-colors duration-300">
        {t('editor.noTemplate')}
      </div>
    );
  }

  return (
    <div className="themed-scrollbar flex w-64 flex-col overflow-auto border-l bg-surface-panel transition-colors duration-300">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('editor.layers')}
      </div>
      {elements.length === 0 && (
        <p className="p-3 text-sm text-muted-foreground">{t('editor.noLayers')}</p>
      )}
      <ul className="flex flex-col" role="list" aria-label={t('editor.layers')}>
        {elements.map((element, displayIndex) => (
          <li
            key={element.id}
            draggable
            onDragStart={(event) => {
              setDraggingId(element.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetIndex(displayIndex);
            }}
            onDragLeave={() =>
              setDropTargetIndex((current) => (current === displayIndex ? null : current))
            }
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(displayIndex);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDropTargetIndex(null);
            }}
            className={cn(
              'flex items-center gap-1 border-b px-1.5 py-1.5 text-sm transition-colors',
              element.id === selectedElementId ? 'bg-primary/10' : 'hover:bg-accent/5',
              draggingId === element.id && 'opacity-40',
              dropTargetIndex === displayIndex &&
                draggingId !== element.id &&
                'border-t-2 border-t-primary'
            )}
          >
            <span
              className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
              title={t('editor.dragReorder')}
              aria-hidden="true"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-foreground"
              onClick={() => onSelect(element)}
              title={element.name}
            >
              {element.name}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title={element.visible ? t('editor.hide') : t('editor.show')}
              onClick={() => upsertElement({ ...element, visible: !element.visible })}
            >
              {element.visible ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title={element.locked ? t('editor.unlock') : t('editor.lock')}
              onClick={() => upsertElement({ ...element, locked: !element.locked })}
            >
              {element.locked ? (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              title={t('common.delete')}
              onClick={() => removeElement(element.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
