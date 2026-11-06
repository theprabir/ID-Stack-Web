import { useMemo, useState } from 'react';
import {
  MousePointerClick,
  Type,
  Image as ImageIcon,
  Barcode as BarcodeIcon,
  FolderClosed,
  EyeOff,
} from 'lucide-react';
import type { SideType, PsdLayerKind } from '@/types/psd';
import { usePsdStore } from '@/stores/psdStore';
import { Button, Input } from '@/components/ui';
import { BarcodeSettings } from './BarcodeSettings';
import { PlaceholderControls } from './PlaceholderControls';
import { cn } from '@/lib/utils';

interface LayerPickerProps {
  side: SideType;
}

const KIND_ICON: Record<PsdLayerKind, typeof Type> = {
  text: Type,
  image: ImageIcon,
  group: FolderClosed,
  shape: ImageIcon,
  other: FolderClosed,
};

/**
 * Layer list for one side with placeholder role selection: text layers get
 * a "Use as text" action, raster layers "Use as photo" / "Use as barcode"
 * actions (any demo image can become the barcode placeholder); selected
 * layers are highlighted with an editable mapping key. Barcode settings
 * (toggle + symbology/colours) render below the list.
 */
export function LayerPicker({ side }: LayerPickerProps): JSX.Element {
  const design = usePsdStore((state) => state.project[side]);
  const placeholders = usePsdStore((state) => state.project.placeholders);
  const addPlaceholder = usePsdStore((state) => state.addPlaceholder);

  const [filter, setFilter] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const layers = useMemo(() => {
    if (!design) return [];
    const query = filter.trim().toLowerCase();
    return design.layers.filter((layer) => {
      if (!showHidden && layer.hidden) return false;
      if (layer.kind === 'group' && layer.childCount > 0 && !layer.hasPixels) return false;
      if (query.length === 0) return true;
      return (
        layer.name.toLowerCase().includes(query) ||
        layer.path.join('/').toLowerCase().includes(query)
      );
    });
  }, [design, filter, showHidden]);

  const placeholderByLayer = useMemo(
    () => new Map(placeholders.filter((p) => p.side === side).map((p) => [p.layerId, p])),
    [placeholders, side]
  );

  if (!design) {
    return (
      <section className="rounded-lg border bg-surface-panel p-4 text-sm text-muted-foreground transition-colors duration-300">
        Upload the {side} design to pick placeholder layers.
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby={`layer-picker-${side}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id={`layer-picker-${side}`} className="text-sm font-semibold capitalize">
            {side} Layers
          </h2>
          <span className="text-xs text-muted-foreground">
            {placeholderByLayer.size} placeholder(s) chosen
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter layers…"
            aria-label="Filter layers"
            className="h-8 w-40 text-xs"
          />
          <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
              className="h-3 w-3"
            />
            Hidden
          </label>
        </div>
      </div>

      <ul
        className="themed-scrollbar max-h-80 divide-y overflow-auto rounded-md border"
        role="list"
      >
        {layers.map((layer, layerIndex) => {
          const placeholder = placeholderByLayer.get(layer.id);
          const isText = layer.kind === 'text';
          const Icon = KIND_ICON[layer.kind];
          return (
            <li
              // PSD ids are not guaranteed unique (duplicated layer names can
              // repeat them), so the row index keeps the list key stable.
              key={`${side}-${layerIndex}-${layer.id}`}
              className={cn(
                // Wraps instead of overflowing: a chosen text layer needs room
                // for its key field, font dropdown and remove button (v0.7.4).
                'flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 text-sm transition-colors',
                placeholder ? 'bg-primary/10' : 'hover:bg-accent/5',
                layer.hidden && 'opacity-60'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate" title={layer.path.join(' / ')}>
                  {layer.name}
                  {layer.hidden && (
                    <EyeOff
                      className="ml-1 inline h-3 w-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </p>
                {isText && layer.text && (
                  <p
                    className="text-xs text-muted-foreground"
                    title={`${layer.text.content}\nFont: ${
                      layer.text.postScriptName ?? layer.text.fontFamily ?? 'default'
                    }`}
                  >
                    “{layer.text.content}”
                    {layer.text.fontSize ? ` · ${Math.round(layer.text.fontSize)}px` : ''}
                    {' · '}
                    <span className="text-muted-foreground/80">
                      {layer.text.postScriptName ?? layer.text.fontFamily ?? 'default'}
                    </span>
                  </p>
                )}
              </div>

              {placeholder ? (
                <PlaceholderControls layer={layer} placeholder={placeholder} />
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  {isText && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => addPlaceholder(layer, side, 'text')}
                    >
                      <Type className="h-3 w-3" aria-hidden="true" />
                      Text
                    </Button>
                  )}
                  {(layer.kind === 'image' || layer.kind === 'shape') && layer.hasPixels && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => addPlaceholder(layer, side, 'photo')}
                      >
                        <ImageIcon className="h-3 w-3" aria-hidden="true" />
                        Photo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => addPlaceholder(layer, side, 'barcode')}
                        title="Use this image as a barcode placeholder"
                      >
                        <BarcodeIcon className="h-3 w-3" aria-hidden="true" />
                        Barcode
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {layers.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No layers match the filter.</p>
      )}

      <div className="mt-3">
        <BarcodeSettings side={side} />
      </div>
    </section>
  );
}
