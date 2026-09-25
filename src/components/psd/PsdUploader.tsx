import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2, X, Layers } from 'lucide-react';
import type { SideType } from '@/types/psd';
import { usePsdStore } from '@/stores/psdStore';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface PsdUploaderProps {
  side: SideType;
}

/**
 * One-sided PSD upload card: click/drag-drop to parse, shows design
 * dimensions, layer count and a remove button.
 */
export function PsdUploader({ side }: PsdUploaderProps): JSX.Element {
  const design = usePsdStore((state) => state.project[side]);
  const isParsing = usePsdStore((state) => state.isParsing);
  const parseError = usePsdStore((state) => state.parseError);
  const loadPsd = usePsdStore((state) => state.loadPsd);
  const clearSide = usePsdStore((state) => state.clearSide);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadPsd(file, side);
    },
    [loadPsd, side]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFile(event.dataTransfer.files);
    },
    [handleFile]
  );

  const label = side === 'front' ? 'Front Design' : 'Back Design';

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby={`psd-upload-${side}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id={`psd-upload-${side}`} className="text-sm font-semibold">
            {label}
          </h2>
        </div>
        {design && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
            onClick={() => clearSide(side)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!design && !isParsing && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Upload the ${side} PSD file`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-accent/5'
          )}
        >
          <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">Drop the {side} .psd file or click to browse</p>
          <p className="text-xs text-muted-foreground">Layered Photoshop file required</p>
        </div>
      )}

      {isParsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Parsing PSD…
        </div>
      )}

      {design && (
        <div className="flex items-center gap-3">
          <img
            src={design.compositeUrl}
            alt={`${label} preview`}
            className="h-16 w-auto rounded border object-contain"
          />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium" title={design.fileName}>
              {design.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {design.width} × {design.height} px · {design.layers.length} layers
            </p>
          </div>
        </div>
      )}

      {parseError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {parseError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".psd"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
