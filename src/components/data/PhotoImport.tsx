import { useCallback, useRef, useState } from 'react';
import { Images, Upload, X, Loader2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Photo import card: multi-file picker + drag-drop, match-mode selection
 * (filename / column / manual) and a thumbnail grid with remove buttons.
 */
export function PhotoImport(): JSX.Element {
  const photos = useDataStore((state) => state.photos);
  const isLoading = useDataStore((state) => state.isLoadingPhotos);
  const photoError = useDataStore((state) => state.photoError);
  const matchConfig = useDataStore((state) => state.photoMatchConfig);
  const matchResult = useDataStore((state) => state.photoMatchResult);
  const excelData = useDataStore((state) => state.excelData);
  const loadPhotos = useDataStore((state) => state.loadPhotos);
  const removePhoto = useDataStore((state) => state.removePhoto);
  const clearPhotos = useDataStore((state) => state.clearPhotos);
  const setPhotoMatchMode = useDataStore((state) => state.setPhotoMatchMode);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) void loadPhotos(files);
    },
    [loadPhotos]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const matchedCount = matchResult?.assignments.size ?? 0;

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="photo-import-title"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Images className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="photo-import-title" className="text-sm font-semibold">
            Photos
          </h2>
        </div>
        {photos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearPhotos}>
            Remove all
          </Button>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Click to add photos or drop them here"
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
          'mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/5'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
        <p className="text-sm">Click to add photos or drop them here</p>
      </div>

      {/* Matching strategy */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="photo-match-mode" className="mb-1 block text-xs text-muted-foreground">
            Matching mode
          </label>
          <Select
            id="photo-match-mode"
            value={matchConfig.mode}
            onChange={(event) =>
              setPhotoMatchMode(
                event.target.value as 'filename' | 'column' | 'manual',
                matchConfig.columnName
              )
            }
          >
            <option value="filename">By file name</option>
            <option value="column" disabled={!excelData}>
              By Excel column
            </option>
            <option value="manual">Manual</option>
          </Select>
        </div>
        {matchConfig.mode === 'column' && excelData && (
          <div>
            <label
              htmlFor="photo-match-column"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Photo name column
            </label>
            <Select
              id="photo-match-column"
              value={matchConfig.columnName ?? ''}
              onChange={(event) => setPhotoMatchMode('column', event.target.value)}
            >
              <option value="" disabled>
                Choose a column…
              </option>
              {excelData.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {matchedCount} of {photos.length} photos matched to rows
        </p>
      )}

      {photos.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">
          No photos loaded. Photos can be auto-matched by file name or an Excel column.
        </p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Photos">
          {photos.map((photo) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-md border">
              <img
                src={photo.blobUrl}
                alt={photo.fileName}
                className="aspect-square h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                aria-label={`Delete ${photo.fileName}`}
                title={`Delete ${photo.fileName}`}
                onClick={() => removePhoto(photo.id)}
                className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {photoError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {photoError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
