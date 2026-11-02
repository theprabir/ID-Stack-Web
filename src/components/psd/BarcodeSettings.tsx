import { useMemo } from 'react';
import { Barcode } from 'lucide-react';
import type { SideType, BarcodeConfig } from '@/types/psd';
import { usePsdStore } from '@/stores/psdStore';
import { Select, Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

interface BarcodeSettingsProps {
  side: SideType;
}

/** bwip-js symbologies offered in the picker */
const SYMBOLOGIES: { value: BarcodeConfig['symbology']; label: string }[] = [
  { value: 'code128', label: 'Code 128' },
  { value: 'qrcode', label: 'QR Code' },
  { value: 'ean13', label: 'EAN-13' },
];

/**
 * Barcode settings for one side of the design. Renders only when the side
 * actually has barcode placeholders. Each placeholder shows an enable
 * toggle; the symbology / bar colour / background controls appear only
 * while the toggle is on (matching the demo-image fallback: toggled off
 * keeps the original image layer untouched).
 */
export function BarcodeSettings({ side }: BarcodeSettingsProps): JSX.Element | null {
  const placeholders = usePsdStore((state) => state.project.placeholders);
  const setBarcodeEnabled = usePsdStore((state) => state.setBarcodeEnabled);
  const updateBarcodeConfig = usePsdStore((state) => state.updateBarcodeConfig);

  const barcodePlaceholders = useMemo(
    () => placeholders.filter((placeholder) => placeholder.side === side && placeholder.role === 'barcode'),
    [placeholders, side]
  );

  if (barcodePlaceholders.length === 0) return null;

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-label={`${side} barcode settings`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Barcode className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold capitalize">Barcode — {side}</h2>
        <span className="text-xs text-muted-foreground">
          Value comes from the mapped column; size follows the chosen image.
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {barcodePlaceholders.map((placeholder) => {
          const enabled = placeholder.barcodeEnabled !== false;
          const config = placeholder.barcodeConfig;
          return (
            <div key={placeholder.layerId} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={placeholder.layerName}>
                    {placeholder.layerName}
                  </p>
                  <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {`{{${placeholder.key}}}`}
                  </code>
                </div>

                {/* Enable toggle — the only control visible when off */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Enable barcode for ${placeholder.layerName}`}
                  onClick={() => setBarcodeEnabled(placeholder.layerId, !enabled)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                    enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      enabled ? 'translate-x-4' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>

              {enabled && config && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Label className="flex flex-col gap-1 text-xs">
                    Symbology
                    <Select
                      aria-label={`Barcode symbology for ${placeholder.layerName}`}
                      className="h-8 text-xs"
                      value={config.symbology}
                      onChange={(event) =>
                        updateBarcodeConfig(placeholder.layerId, {
                          symbology: event.target.value as BarcodeConfig['symbology'],
                        })
                      }
                    >
                      {SYMBOLOGIES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </Select>
                  </Label>

                  <Label className="flex flex-col gap-1 text-xs">
                    Bar colour
                    <Input
                      type="color"
                      aria-label={`Barcode colour for ${placeholder.layerName}`}
                      className="h-8 w-full cursor-pointer p-1"
                      value={config.color}
                      onChange={(event) =>
                        updateBarcodeConfig(placeholder.layerId, { color: event.target.value })
                      }
                    />
                  </Label>

                  <Label className="flex flex-col gap-1 text-xs">
                    Background
                    <Input
                      type="color"
                      aria-label={`Barcode background for ${placeholder.layerName}`}
                      className="h-8 w-full cursor-pointer p-1"
                      value={config.background}
                      onChange={(event) =>
                        updateBarcodeConfig(placeholder.layerId, { background: event.target.value })
                      }
                    />
                  </Label>
                </div>
              )}

              {enabled && !config && (
                <p className="mt-2 text-xs text-destructive">
                  This placeholder has no barcode settings — remove it and choose the image again.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
