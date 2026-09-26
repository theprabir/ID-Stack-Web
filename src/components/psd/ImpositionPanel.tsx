import type { ImpositionSettings, LengthUnit, NumberPosition } from '@/services/impositionTypes';
import {
  DEFAULT_IMPOSITION_SETTINGS,
  PAPER_PRESETS,
  computeSheetLayout,
} from '@/services/impositionTypes';
import { Input, Select, Label, Checkbox } from '@/components/ui';

interface ImpositionPanelProps {
  settings: ImpositionSettings;
  onChange: (settings: ImpositionSettings) => void;
  disabled: boolean;
}

/** Compact labelled number input */
function NumberField({
  id,
  label,
  value,
  disabled,
  step = 1,
  min = 0,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  step?: number;
  min?: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <div>
      <Label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 text-xs"
      />
    </div>
  );
}

/**
 * Full imposition settings panel — every dimension (paper size with presets
 * or custom + unit, bleed, gap, margin, crop marks, numbering position/size/
 * colour) is user-controlled. Shows the computed cards-per-sheet live.
 */
export function ImpositionPanel({
  settings,
  onChange,
  disabled,
}: ImpositionPanelProps): JSX.Element {
  const patch = (partial: Partial<ImpositionSettings>): void =>
    onChange({ ...settings, ...partial });

  const layout = computeSheetLayout(settings);
  const unit = settings.unit;

  return (
    <div className="space-y-3 rounded-md border bg-surface-card p-3">
      {/* Paper */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label htmlFor="imp-paper" className="mb-1 block text-xs text-muted-foreground">
            Paper
          </Label>
          <Select
            id="imp-paper"
            value={settings.paper.preset}
            disabled={disabled}
            onChange={(event) =>
              patch({
                paper: {
                  ...settings.paper,
                  preset: event.target.value as ImpositionSettings['paper']['preset'],
                },
              })
            }
            className="h-9 text-xs"
          >
            {Object.entries(PAPER_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="imp-unit" className="mb-1 block text-xs text-muted-foreground">
            Unit
          </Label>
          <Select
            id="imp-unit"
            value={unit}
            disabled={disabled}
            onChange={(event) => patch({ unit: event.target.value as LengthUnit })}
            className="h-9 text-xs"
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">inch</option>
            <option value="pt">pt</option>
          </Select>
        </div>
        {settings.paper.preset === 'custom' && (
          <>
            <NumberField
              id="imp-paper-w"
              label="Paper width"
              value={settings.paper.width}
              disabled={disabled}
              onChange={(value) => patch({ paper: { ...settings.paper, width: value } })}
            />
            <NumberField
              id="imp-paper-h"
              label="Paper height"
              value={settings.paper.height}
              disabled={disabled}
              onChange={(value) => patch({ paper: { ...settings.paper, height: value } })}
            />
          </>
        )}
        <div className="flex items-end pb-1">
          <Checkbox
            id="imp-landscape"
            checked={settings.paper.landscape}
            disabled={disabled}
            onChange={(event) =>
              patch({ paper: { ...settings.paper, landscape: event.target.checked } })
            }
          />
          <Label htmlFor="imp-landscape" className="ml-1.5 text-xs">
            Landscape
          </Label>
        </div>
      </div>

      {/* Card size + spacing. Card width/height are LOCKED to the uploaded
          PSD (auto-derived at 72 dpi); only the direction selector changes
          them (swapping width/height). Manual editing is disabled to prevent
          sizes that break the imposition maths. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          id="imp-card-w"
          label={`Card width (${unit}, from PSD)`}
          value={settings.cardWidth}
          disabled={true}
          step={0.1}
          onChange={(value) => patch({ cardWidth: value })}
        />
        <NumberField
          id="imp-card-h"
          label={`Card height (${unit}, from PSD)`}
          value={settings.cardHeight}
          disabled={true}
          step={0.1}
          onChange={(value) => patch({ cardHeight: value })}
        />
        <div>
          <Label htmlFor="imp-card-orient" className="mb-1 block text-xs text-muted-foreground">
            Card direction (size auto-set from PSD)
          </Label>
          <Select
            id="imp-card-orient"
            value={settings.cardOrientation}
            disabled={disabled}
            onChange={(event) =>
              patch({
                cardOrientation: event.target.value as ImpositionSettings['cardOrientation'],
              })
            }
            className="h-9 text-xs"
          >
            <option value="portrait">Portrait (tall)</option>
            <option value="landscape">Landscape (wide)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="imp-arrangement" className="mb-1 block text-xs text-muted-foreground">
            Arrangement
          </Label>
          <Select
            id="imp-arrangement"
            value={settings.arrangement}
            disabled={disabled}
            onChange={(event) =>
              patch({ arrangement: event.target.value as ImpositionSettings['arrangement'] })
            }
            className="h-9 text-xs"
          >
            <option value="interleaved">Back below its front (one PDF)</option>
            <option value="separate">Fronts &amp; backs on separate sheets</option>
          </Select>
        </div>
        <NumberField
          id="imp-bleed"
          label={`Bleed (${unit})`}
          value={settings.bleed}
          disabled={disabled}
          step={0.5}
          onChange={(value) => patch({ bleed: value })}
        />
        <NumberField
          id="imp-gap"
          label={`Gap (${unit})`}
          value={settings.gap}
          disabled={disabled}
          step={0.5}
          onChange={(value) => patch({ gap: value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          id="imp-margin"
          label={`Margin (${unit})`}
          value={settings.margin}
          disabled={disabled}
          step={0.5}
          onChange={(value) => patch({ margin: value })}
        />
        <div className="flex items-end pb-1">
          <Checkbox
            id="imp-cropmarks"
            checked={settings.cropMarks}
            disabled={disabled}
            onChange={(event) => patch({ cropMarks: event.target.checked })}
          />
          <Label htmlFor="imp-cropmarks" className="ml-1.5 text-xs">
            Crop marks
          </Label>
        </div>
        {settings.cropMarks && (
          <>
            <NumberField
              id="imp-cm-len"
              label={`Mark length (${unit})`}
              value={settings.cropMarkLength}
              disabled={disabled}
              step={0.5}
              onChange={(value) => patch({ cropMarkLength: value })}
            />
            <NumberField
              id="imp-cm-off"
              label={`Mark offset (${unit})`}
              value={settings.cropMarkOffset}
              disabled={disabled}
              step={0.5}
              onChange={(value) => patch({ cropMarkOffset: value })}
            />
          </>
        )}
      </div>

      {/* Numbering */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label htmlFor="imp-num-mode" className="mb-1 block text-xs text-muted-foreground">
            Numbering
          </Label>
          <Select
            id="imp-num-mode"
            value={settings.numbering.mode}
            disabled={disabled}
            onChange={(event) =>
              patch({
                numbering: {
                  ...settings.numbering,
                  mode: event.target.value as ImpositionSettings['numbering']['mode'],
                },
              })
            }
            className="h-9 text-xs"
          >
            <option value="per-sheet">Per sheet</option>
            <option value="continuous">Continuous</option>
            <option value="none">None</option>
          </Select>
        </div>
        {settings.numbering.mode !== 'none' && (
          <>
            <div>
              <Label htmlFor="imp-num-pos" className="mb-1 block text-xs text-muted-foreground">
                Position
              </Label>
              <Select
                id="imp-num-pos"
                value={settings.numbering.position}
                disabled={disabled}
                onChange={(event) =>
                  patch({
                    numbering: {
                      ...settings.numbering,
                      position: event.target.value as NumberPosition,
                    },
                  })
                }
                className="h-9 text-xs"
              >
                <option value="top-left">Top left</option>
                <option value="top-center">Top center</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-right">Bottom right</option>
              </Select>
            </div>
            <NumberField
              id="imp-num-size"
              label="Number size (pt)"
              value={settings.numbering.fontSize}
              disabled={disabled}
              step={1}
              onChange={(value) => patch({ numbering: { ...settings.numbering, fontSize: value } })}
            />
            <div>
              <Label htmlFor="imp-num-color" className="mb-1 block text-xs text-muted-foreground">
                Number colour
              </Label>
              <Input
                id="imp-num-color"
                type="color"
                value={settings.numbering.color}
                disabled={disabled}
                onChange={(event) =>
                  patch({ numbering: { ...settings.numbering, color: event.target.value } })
                }
                className="h-9 w-full cursor-pointer p-0.5"
              />
            </div>
          </>
        )}
      </div>

      {/* Per-slot card numbers */}
      <div className="rounded-md border p-2">
        <div className="mb-2 flex items-center pb-1">
          <Checkbox
            id="imp-cardnum-enabled"
            checked={settings.cardNumbers.enabled}
            disabled={disabled}
            onChange={(event) =>
              patch({
                cardNumbers: { ...settings.cardNumbers, enabled: event.target.checked },
              })
            }
          />
          <Label htmlFor="imp-cardnum-enabled" className="ml-1.5 text-xs font-medium">
            Card numbers (per slot)
          </Label>
        </div>
        {settings.cardNumbers.enabled && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor="imp-cardnum-pos" className="mb-1 block text-xs text-muted-foreground">
                Position
              </Label>
              <Select
                id="imp-cardnum-pos"
                value={settings.cardNumbers.position}
                disabled={disabled}
                onChange={(event) =>
                  patch({
                    cardNumbers: {
                      ...settings.cardNumbers,
                      position: event.target.value as ImpositionSettings['cardNumbers']['position'],
                    },
                  })
                }
                className="h-9 text-xs"
              >
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </Select>
            </div>
            <NumberField
              id="imp-cardnum-size"
              label="Size (pt)"
              value={settings.cardNumbers.fontSize}
              disabled={disabled}
              step={1}
              onChange={(value) =>
                patch({ cardNumbers: { ...settings.cardNumbers, fontSize: value } })
              }
            />
            <div>
              <Label
                htmlFor="imp-cardnum-color"
                className="mb-1 block text-xs text-muted-foreground"
              >
                Colour
              </Label>
              <Input
                id="imp-cardnum-color"
                type="color"
                value={settings.cardNumbers.color}
                disabled={disabled}
                onChange={(event) =>
                  patch({ cardNumbers: { ...settings.cardNumbers, color: event.target.value } })
                }
                className="h-9 w-full cursor-pointer p-0.5"
              />
            </div>
            <NumberField
              id="imp-cardnum-margin"
              label={`Margin (${unit})`}
              value={settings.cardNumbers.margin}
              disabled={disabled}
              step={0.5}
              onChange={(value) =>
                patch({ cardNumbers: { ...settings.cardNumbers, margin: value } })
              }
            />
            <div>
              <Label
                htmlFor="imp-cardnum-prefix"
                className="mb-1 block text-xs text-muted-foreground"
              >
                Prefix
              </Label>
              <Input
                id="imp-cardnum-prefix"
                type="text"
                value={settings.cardNumbers.prefix}
                disabled={disabled}
                maxLength={6}
                onChange={(event) =>
                  patch({ cardNumbers: { ...settings.cardNumbers, prefix: event.target.value } })
                }
                className="h-9 text-xs"
              />
            </div>
            <NumberField
              id="imp-cardnum-start"
              label="Start at"
              value={settings.cardNumbers.start}
              disabled={disabled}
              step={1}
              min={0}
              onChange={(value) =>
                patch({ cardNumbers: { ...settings.cardNumbers, start: value } })
              }
            />
          </div>
        )}
      </div>

      {/* Duplex pairing */}
      <div className="flex items-center pb-1">
        <Checkbox
          id="imp-duplex"
          checked={settings.duplex}
          disabled={disabled}
          onChange={(event) => patch({ duplex: event.target.checked })}
        />
        <Label htmlFor="imp-duplex" className="ml-1.5 text-xs">
          Duplex pairing (mirrors backs; applies to the separate-sheets layout)
        </Label>
      </div>

      {/* Live fit summary */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {layout
          ? `${layout.columns} × ${layout.rows} = ${layout.perSheet} cards per sheet (page ${(
              layout.pageWidth / 72
            ).toFixed(1)}×${(layout.pageHeight / 72).toFixed(1)} in)`
          : '⚠ Cards do not fit on this paper — reduce card size, bleed, gap or margin.'}
      </p>
    </div>
  );
}

export { DEFAULT_IMPOSITION_SETTINGS };
