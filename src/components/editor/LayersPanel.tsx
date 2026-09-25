import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react';
import type { CanvasElement } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';
import { sideKey } from '@/types/template';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LayersPanelProps {
  selectedElementId: string | null;
  onSelect: (element: CanvasElement) => void;
}

/** Right panel layer list: order (top first), visibility, lock, rename, delete. */
export function LayersPanel({ selectedElementId, onSelect }: LayersPanelProps): JSX.Element {
  const { t } = useTranslation();
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const currentSide = useTemplateStore((state) => state.currentSide);
  const upsertElement = useTemplateStore((state) => state.upsertElement);
  const removeElement = useTemplateStore((state) => state.removeElement);

  const elements: CanvasElement[] = currentTemplate
    ? [...currentTemplate[sideKey(currentSide)].elements].reverse() // top-most first
    : [];

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
      <ul className="flex flex-col">
        {elements.map((element) => (
          <li
            key={element.id}
            className={cn(
              'flex items-center gap-1.5 border-b px-2 py-1.5 text-sm',
              element.id === selectedElementId ? 'bg-primary/10' : 'hover:bg-accent/5'
            )}
          >
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
