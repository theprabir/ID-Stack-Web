import { useCallback } from 'react';
import {
  Type,
  Image as ImageIcon,
  Square,
  QrCode,
  Braces,
  FilePlus2,
  Save,
  Circle,
} from 'lucide-react';
import type { CanvasElement } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';
import { sideKey } from '@/types/template';
import { generateId } from '@/utils/id';
import { Button } from '@/components/ui';
import { Label } from '@/components/ui';

/** Display names for element kinds */
const ELEMENT_NAMES: Record<CanvasElement['type'], string> = {
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  barcode: 'Barcode',
  placeholder: 'Placeholder',
};

interface ToolsPanelProps {
  onAddElement: (element: CanvasElement) => void;
  onSave: () => void;
  canSave: boolean;
}

/** Left panel: element creation and template-level actions. */
export function ToolsPanel({ onAddElement, onSave, canSave }: ToolsPanelProps): JSX.Element {
  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const createTemplate = useTemplateStore((state) => state.createTemplate);
  const setSideBackground = useTemplateStore((state) => state.setSideBackground);
  const currentSide = useTemplateStore((state) => state.currentSide);

  /** Build a default element of a given type, centred on the card. */
  const makeElement = useCallback(
    (kind: 'text' | 'image' | 'shape' | 'barcode' | 'placeholder'): CanvasElement => {
      const width = kind === 'text' || kind === 'placeholder' ? 50 : 25;
      const height = kind === 'text' || kind === 'placeholder' ? 10 : 25;
      const base: CanvasElement = {
        id: generateId(),
        name: ELEMENT_NAMES[kind],
        type: kind,
        x: 17,
        y: 15,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 0,
        fill: { type: 'solid', color: kind === 'placeholder' ? '#2563EB' : '#111111' },
      };
      if (kind === 'text') {
        base.text = 'Sample text';
        base.fontFamily = 'Inter';
        base.fontSize = 12;
        base.textAlign = 'left';
      }
      if (kind === 'placeholder') {
        base.columnName = 'Name';
        base.defaultValue = '—';
        base.strokeDashArray = [4, 3];
      }
      if (kind === 'barcode') {
        base.barcodeType = 'qrcode';
        base.barcodeData = 'ID-STACK';
      }
      return base;
    },
    []
  );

  const addButtons: Array<{
    kind: 'text' | 'image' | 'shape' | 'barcode' | 'placeholder';
    Icon: typeof Type;
  }> = [
    { kind: 'text', Icon: Type },
    { kind: 'image', Icon: ImageIcon },
    { kind: 'shape', Icon: Square },
    { kind: 'barcode', Icon: QrCode },
    { kind: 'placeholder', Icon: Braces },
  ];

  return (
    <div className="themed-scrollbar flex w-52 flex-col gap-3 overflow-auto border-r bg-surface-panel p-3 transition-colors duration-300">
      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
          Add element
        </Label>
        <div className="grid grid-cols-1 gap-1">
          {addButtons.map(({ kind, Icon }) => (
            <Button
              key={kind}
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              onClick={() => onAddElement(makeElement(kind))}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {ELEMENT_NAMES[kind]}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
          Quick shapes
        </Label>
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-1"
            onClick={() => onAddElement(makeElement('shape'))}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Rectangle
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-1"
            onClick={() => {
              const circle = makeElement('shape');
              circle.name = 'Circle';
              circle.cornerRadius = 999;
              onAddElement(circle);
            }}
          >
            <Circle className="h-3.5 w-3.5" aria-hidden="true" />
            Circle
          </Button>
        </div>
      </div>

      {currentTemplate && (
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Background
          </Label>
          <input
            type="color"
            value={currentTemplate[sideKey(currentSide)].backgroundColor}
            onChange={(event) => setSideBackground(event.target.value)}
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-card"
            aria-label="Background"
          />
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={() => createTemplate('Untitled template')}
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          New template
        </Button>
        <Button
          variant="default"
          size="sm"
          className="justify-start gap-2"
          disabled={!canSave}
          onClick={onSave}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
}
