import { X } from 'lucide-react';
import type { PsdLayerInfo, PsdPlaceholder } from '@/types/psd';
import { usePsdStore } from '@/stores/psdStore';
import { useFontFamilies } from '@/hooks/useFontFamilies';
import { Button, Input, Label, Select } from '@/components/ui';

interface PlaceholderControlsProps {
  layer: PsdLayerInfo;
  placeholder: PsdPlaceholder;
}

/**
 * Inline controls for a chosen placeholder layer (v0.7.4):
 * - the mapping key (column name used by the mapper), and
 * - for text placeholders, an OPTIONAL font override: any uploaded font can
 *   replace the font authored in the PSD for that one field. Left on
 *   "PSD font", the placeholder keeps the historical behaviour — the PSD
 *   PostScript name is matched against uploaded/bundled families.
 *
 * Layout: the controls sit on two explicit rows — key + remove, then the font
 * label + dropdown — so nothing is ever squeezed out of its box. (The layer
 * list lives in a narrow column, and an earlier single-row layout overflowed:
 * the "Font" label was pushed over the layer text and the dropdown clipped the
 * selected font name.) The dropdown takes the full row width (capped on wide
 * panels), so a long uploaded family name stays readable.
 */
export function PlaceholderControls({
  layer,
  placeholder,
}: PlaceholderControlsProps): JSX.Element {
  const renamePlaceholderKey = usePsdStore((state) => state.renamePlaceholderKey);
  const removePlaceholder = usePsdStore((state) => state.removePlaceholder);
  const setPlaceholderFont = usePsdStore((state) => state.setPlaceholderFont);
  const families = useFontFamilies();

  const isText = placeholder.role === 'text';
  const psdFont = layer.text?.postScriptName ?? layer.text?.fontFamily ?? 'default';
  const override = placeholder.fontFamily ?? '';
  const overrideMissing = override.length > 0 && !families.includes(override);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-end gap-1 sm:max-w-[26rem]">
      <div className="flex w-full items-center justify-end gap-1">
        <Input
          value={placeholder.key}
          onChange={(event) => renamePlaceholderKey(layer.id, event.target.value)}
          aria-label={`Mapping key for ${layer.name}`}
          title="Mapping key used in column mapping"
          className="h-7 min-w-0 flex-1 text-xs sm:max-w-24"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive"
          aria-label={`Unchoose ${layer.name}`}
          title="Remove placeholder"
          onClick={() => removePlaceholder(layer.id)}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {isText && (
        <div className="flex w-full items-center justify-end gap-1">
          <Label
            htmlFor={`font-override-${layer.id}`}
            className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
            title="Render this placeholder with an uploaded font instead of the PSD font"
          >
            Font
          </Label>
          <Select
            id={`font-override-${layer.id}`}
            value={override}
            onChange={(event) => setPlaceholderFont(layer.id, event.target.value || undefined)}
            aria-label={`Font override for ${layer.name}`}
            title={
              override
                ? `Font override: ${override}`
                : `Following the PSD font: ${psdFont}`
            }
            className="h-7 min-w-0 flex-1 text-xs"
          >
            {/* Short default label: the PSD font can be a long PostScript name,
                so it is shown on the layer's detail line + in this tooltip. */}
            <option value="">PSD font (auto)</option>
            {overrideMissing && <option value={override}>{override} (not loaded)</option>}
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
