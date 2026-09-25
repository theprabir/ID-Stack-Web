import { useCallback } from 'react';
import type { CanvasElement, ShadowConfig } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';

const ELEMENT_SHADOW_DEFAULT: ShadowConfig = {
  color: '#000000',
  blur: 4,
  offsetX: 2,
  offsetY: 2,
  enabled: false,
};
import { Label, Input, Select, Checkbox, Button } from '@/components/ui';

/** Display names for element kinds */
const ELEMENT_NAMES: Record<CanvasElement['type'], string> = {
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  barcode: 'Barcode',
  placeholder: 'Placeholder',
};

interface PropertiesPanelProps {
  element: CanvasElement | null;
}

/**
 * Right panel: context-sensitive properties for the selected element.
 * Shows position/size always; text options for text/placeholder; appearance
 * (fill, stroke, shadow, opacity) for all types.
 */
export function PropertiesPanel({ element }: PropertiesPanelProps): JSX.Element {
  const upsertElement = useTemplateStore((state) => state.upsertElement);

  const update = useCallback(
    (patch: Partial<CanvasElement>) => {
      if (!element) return;
      upsertElement({ ...element, ...patch });
    },
    [element, upsertElement]
  );

  const updateShadow = useCallback(
    (patch: Partial<ShadowConfig>) => {
      if (!element) return;
      const shadow: ShadowConfig = { ...ELEMENT_SHADOW_DEFAULT, ...element.shadow, ...patch };
      update({ shadow });
    },
    [element, update]
  );

  if (!element) {
    return (
      <div className="w-64 border-l bg-surface-panel p-3 text-sm text-muted-foreground transition-colors duration-300">
        Select an element to edit its properties.
      </div>
    );
  }

  const isTextish = element.type === 'text' || element.type === 'placeholder';

  return (
    <div className="themed-scrollbar w-64 overflow-auto border-l bg-surface-panel p-3 transition-colors duration-300">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {ELEMENT_NAMES[element.type]}
      </div>

      {/* Name */}
      <div className="mb-3">
        <Label htmlFor="prop-name" className="mb-1 block text-xs">
          Name
        </Label>
        <Input
          id="prop-name"
          value={element.name}
          className="h-8"
          onChange={(event) => update({ name: event.target.value })}
        />
      </div>

      {/* Position & size */}
      <fieldset className="mb-3 rounded-md border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Position &amp; size
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['x', 'X (mm)'],
              ['y', 'Y (mm)'],
              ['width', 'Width (mm)'],
              ['height', 'Height (mm)'],
              ['rotation', 'Rotation (°)'],
            ] as Array<[keyof CanvasElement, string]>
          ).map(([key, label]) => (
            <div key={String(key)}>
              <Label htmlFor={`prop-${String(key)}`} className="mb-1 block text-xs">
                {label}
              </Label>
              <Input
                id={`prop-${String(key)}`}
                type="number"
                className="h-8"
                value={Math.round((element[key] as number) * 10) / 10}
                step={key === 'rotation' ? 5 : 0.5}
                onChange={(event) =>
                  update({ [key]: Number(event.target.value) } as Partial<CanvasElement>)
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/* Text-specific */}
      {isTextish && (
        <fieldset className="mb-3 rounded-md border p-2">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Text</legend>
          <div className="flex flex-col gap-2">
            {element.type === 'placeholder' ? (
              <div>
                <Label htmlFor="prop-column" className="mb-1 block text-xs">
                  Excel column
                </Label>
                <Input
                  id="prop-column"
                  value={element.columnName ?? ''}
                  className="h-8"
                  placeholder="Name"
                  onChange={(event) => update({ columnName: event.target.value })}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="prop-text" className="mb-1 block text-xs">
                  Content
                </Label>
                <Input
                  id="prop-text"
                  value={element.text ?? ''}
                  className="h-8"
                  onChange={(event) => update({ text: event.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="prop-font" className="mb-1 block text-xs">
                  Font
                </Label>
                <Input
                  id="prop-font"
                  value={element.fontFamily ?? ''}
                  className="h-8"
                  onChange={(event) => update({ fontFamily: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="prop-fontsize" className="mb-1 block text-xs">
                  Size (pt)
                </Label>
                <Input
                  id="prop-fontsize"
                  type="number"
                  min={6}
                  max={72}
                  value={element.fontSize ?? 12}
                  className="h-8"
                  onChange={(event) => update({ fontSize: Number(event.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="prop-weight" className="mb-1 block text-xs">
                  Weight
                </Label>
                <Select
                  id="prop-weight"
                  value={element.fontWeight ?? 'normal'}
                  className="h-8"
                  onChange={(event) => update({ fontWeight: event.target.value })}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="prop-align" className="mb-1 block text-xs">
                  Alignment
                </Label>
                <Select
                  id="prop-align"
                  value={element.textAlign ?? 'left'}
                  className="h-8"
                  onChange={(event) =>
                    update({ textAlign: event.target.value as CanvasElement['textAlign'] })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="prop-underline"
                checked={element.underline ?? false}
                onChange={(event) => update({ underline: event.target.checked })}
              />
              <Label htmlFor="prop-underline">Underline</Label>
            </div>
          </div>
        </fieldset>
      )}

      {/* Appearance */}
      <fieldset className="mb-3 rounded-md border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Appearance</legend>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="prop-fill" className="text-xs">
              Fill
            </Label>
            <input
              id="prop-fill"
              type="color"
              value={element.fill?.color ?? '#111111'}
              onChange={(event) => update({ fill: { type: 'solid', color: event.target.value } })}
              className="h-7 w-14 cursor-pointer rounded border border-input bg-card"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="prop-stroke" className="text-xs">
              Stroke
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id="prop-strokewidth"
                type="number"
                min={0}
                max={20}
                value={element.strokeWidth ?? 0}
                className="h-7 w-14"
                onChange={(event) => update({ strokeWidth: Number(event.target.value) })}
              />
              <input
                aria-label="Stroke"
                type="color"
                value={element.stroke || '#000000'}
                onChange={(event) => update({ stroke: event.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-input bg-card"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="prop-opacity" className="mb-1 block text-xs">
              Opacity
            </Label>
            <input
              id="prop-opacity"
              type="range"
              min={0}
              max={100}
              value={Math.round(element.opacity * 100)}
              className="w-full accent-[hsl(var(--primary))]"
              onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
            />
          </div>
        </div>
      </fieldset>

      {/* Shadow */}
      <fieldset className="rounded-md border p-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Shadow</legend>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="prop-shadow-enabled"
              checked={element.shadow?.enabled ?? false}
              onChange={(event) => updateShadow({ enabled: event.target.checked })}
            />
            <Label htmlFor="prop-shadow-enabled">Enable shadow</Label>
          </div>
          {element.shadow?.enabled && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="prop-shadow-color" className="text-xs">
                  Color
                </Label>
                <input
                  id="prop-shadow-color"
                  type="color"
                  value={element.shadow?.color ?? '#000000'}
                  onChange={(event) => updateShadow({ color: event.target.value })}
                  className="h-7 w-14 cursor-pointer rounded border border-input bg-card"
                />
              </div>
              {(
                [
                  ['blur', 'Blur', 0, 50],
                  ['offsetX', 'Offset X', -50, 50],
                  ['offsetY', 'Offset Y', -50, 50],
                ] as Array<[keyof ShadowConfig, string, number, number]>
              ).map(([key, label, min, max]) => (
                <div key={String(key)} className="flex items-center justify-between gap-2">
                  <Label htmlFor={`prop-shadow-${String(key)}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`prop-shadow-${String(key)}`}
                    type="number"
                    min={min}
                    max={max}
                    value={element.shadow?.[key] as number}
                    className="h-7 w-16"
                    onChange={(event) =>
                      updateShadow({ [key]: Number(event.target.value) } as Partial<ShadowConfig>)
                    }
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </fieldset>

      <div className="mt-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => update({ shadow: { ...ELEMENT_SHADOW_DEFAULT } })}
        >
          Reset effects
        </Button>
      </div>
    </div>
  );
}
