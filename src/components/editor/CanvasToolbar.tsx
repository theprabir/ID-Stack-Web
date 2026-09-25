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
  const currentTool = useCanvasStore((state) => state.currentTool);
  const setTool = useCanvasStore((state) => state.setTool);

  const tools: Array<{ tool: ToolType; label: string; Icon: typeof Type }> = [
    { tool: 'select', label: 'Select', Icon: MousePointer2 },
    { tool: 'text', label: 'Text', Icon: Type },
    { tool: 'image', label: 'Image', Icon: ImageIcon },
    { tool: 'shape', label: 'Shape', Icon: Square },
    { tool: 'barcode', label: 'Barcode', Icon: QrCode },
    { tool: 'placeholder', label: 'Placeholder', Icon: Braces },
    { tool: 'pan', label: 'Pan', Icon: Hand },
  ];

  return (
    <div
      className="flex w-12 flex-col items-center gap-1 border-r bg-surface-panel py-2 transition-colors duration-300"
      role="toolbar"
      aria-label="Editor tools"
    >
      {tools.map(({ tool, label, Icon }) => (
        <Button
          key={tool}
          variant={currentTool === tool ? 'default' : 'ghost'}
          size="icon"
          title={label}
          aria-label={label}
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
        title="Undo"
        aria-label="Undo"
        className="h-9 w-9"
        onClick={onUndo}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo"
        className="h-9 w-9"
        onClick={onRedo}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="my-1 h-px w-8 bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        title="Bring to front"
        aria-label="Bring to front"
        className="h-9 w-9"
        onClick={onBringToFront}
      >
        <BringToFront className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Send to back"
        aria-label="Send to back"
        className="h-9 w-9"
        onClick={onSendToBack}
      >
        <SendToBack className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Delete"
        aria-label="Delete"
        className="h-9 w-9 text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className={cn('sr-only')}>Editor tools</span>
    </div>
  );
}
