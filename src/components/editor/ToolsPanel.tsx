import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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

interface ToolsPanelProps {
  onAddElement: (element: CanvasElement) => void;
  onSave: () => void;
  canSave: boolean;
}

/** Left panel: element creation and template-level actions. */
export function ToolsPanel({ onAddElement, onSave, canSave }: ToolsPanelProps): JSX.Element {
  const { t } = useTranslation();
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
        name: t(`editor.element_${kind}`),
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
        base.text = t('editor.sampleText');
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
    [t]
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
          {t('editor.addElement')}
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
              {t(`editor.element_${kind}`)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
          {t('editor.quickShapes')}
        </Label>
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-1"
            onClick={() => onAddElement(makeElement('shape'))}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {t('editor.shapeRect')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-1"
            onClick={() => {
              const circle = makeElement('shape');
              circle.name = t('editor.shapeCircle');
              circle.cornerRadius = 999;
              onAddElement(circle);
            }}
          >
            <Circle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('editor.shapeCircle')}
          </Button>
        </div>
      </div>

      {currentTemplate && (
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            {t('editor.background')}
          </Label>
          <input
            type="color"
            value={currentTemplate[sideKey(currentSide)].backgroundColor}
            onChange={(event) => setSideBackground(event.target.value)}
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-card"
            aria-label={t('editor.background')}
          />
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={() => createTemplate(t('editor.untitled'))}
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          {t('editor.newTemplate')}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="justify-start gap-2"
          disabled={!canSave}
          onClick={onSave}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
