import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Type,
  Image as ImageIcon,
  Square,
  QrCode,
  Braces,
  Hand,
  Undo2,
  Redo2,
  Trash2,
  BringToFront,
  SendToBack,
} from 'lucide-react';
import type { ToolType } from '@/constants/canvas';
import { useCanvasStore } from '@/stores/canvasStore';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

/** Left tools rail: tool selection + history + object order actions. */
export function CanvasToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDelete,
  onBringToFront,
  onSendToBack,
}: CanvasToolbarProps): JSX.Element {
  const { t } = useTranslation();
  const currentTool = useCanvasStore((state) => state.currentTool);
  const setTool = useCanvasStore((state) => state.setTool);

  const tools: Array<{ tool: ToolType; labelKey: string; Icon: typeof Type }> = [
    { tool: 'select', labelKey: 'editor.toolSelect', Icon: MousePointer2 },
    { tool: 'text', labelKey: 'editor.toolText', Icon: Type },
    { tool: 'image', labelKey: 'editor.toolImage', Icon: ImageIcon },
    { tool: 'shape', labelKey: 'editor.toolShape', Icon: Square },
    { tool: 'barcode', labelKey: 'editor.toolBarcode', Icon: QrCode },
    { tool: 'placeholder', labelKey: 'editor.toolPlaceholder', Icon: Braces },
    { tool: 'pan', labelKey: 'editor.toolPan', Icon: Hand },
  ];

  return (
    <div
      className="flex w-12 flex-col items-center gap-1 border-r bg-surface-panel py-2 transition-colors duration-300"
      role="toolbar"
      aria-label={t('editor.toolbar')}
    >
      {tools.map(({ tool, labelKey, Icon }) => (
        <Button
          key={tool}
          variant={currentTool === tool ? 'default' : 'ghost'}
          size="icon"
          title={t(labelKey)}
          aria-label={t(labelKey)}
          aria-pressed={currentTool === tool}
          className="h-9 w-9"
          onClick={() => setTool(tool)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      ))}

      <div className="my-1 h-px w-8 bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        disabled={!canUndo}
        title={t('editor.undo')}
        aria-label={t('editor.undo')}
        className="h-9 w-9"
        onClick={onUndo}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canRedo}
        title={t('editor.redo')}
        aria-label={t('editor.redo')}
        className="h-9 w-9"
        onClick={onRedo}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="my-1 h-px w-8 bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        title={t('editor.bringToFront')}
        aria-label={t('editor.bringToFront')}
        className="h-9 w-9"
        onClick={onBringToFront}
      >
        <BringToFront className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={t('editor.sendToBack')}
        aria-label={t('editor.sendToBack')}
        className="h-9 w-9"
        onClick={onSendToBack}
      >
        <SendToBack className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={t('common.delete')}
        aria-label={t('common.delete')}
        className="h-9 w-9 text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className={cn('sr-only')}>{t('editor.toolbar')}</span>
    </div>
  );
}
