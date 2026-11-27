import { useCallback, useRef, useState } from 'react';
import { Images, Upload, X, Loader2, FileArchive, AlertTriangle } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import type { PhotoLibrary } from '@/types/data';
import { Button, ConfirmDialog, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Photo import card (v0.7.6): loose images and one library per ZIP archive.
 * Each data source is mapped to its own library, so two classes may both
 * contain "ravi.jpg" without colliding. Images alone keep the old behaviour.
 */
export function PhotoImport(): JSX.Element {
  const photos = useDataStore((state) => state.photos);
  const libraries = useDataStore((state) => state.photoLibraries);
  const photoSourceMap = useDataStore((state) => state.photoSourceMap);
  const sources = useDataStore((state) => state.sources);
  const isLoading = useDataStore((state) => state.isLoadingPhotos);
  const zipProgress = useDataStore((state) => state.photoZipProgress);
  const photoError = useDataStore((state) => state.photoError);
  const matchConfig = useDataStore((state) => state.photoMatchConfig);
  const matchResult = useDataStore((state) => state.photoMatchResult);
  const loadPhotoInputs = useDataStore((state) => state.loadPhotoInputs);
  const removePhoto = useDataStore((state) => state.removePhoto);
  const removePhotoLibrary = useDataStore((state) => state.removePhotoLibrary);
  const mapPhotoLibrary = useDataStore((state) => state.mapPhotoLibrary);
  const clearPhotos = useDataStore((state) => state.clearPhotos);
  const setPhotoMatchMode = useDataStore((state) => state.setPhotoMatchMode);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [libraryToRemove, setLibraryToRemove] = useState<PhotoLibrary | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) void loadPhotoInputs(files);
    },
    [loadPhotoInputs]
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
  const photoColumnSource = sources.find((source) => !source.error);
  const unmappedSources =
    libraries.length > 1
      ? sources.filter((source) => !source.error && !photoSourceMap[source.id])
      : [];

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
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            Remove all
          </Button>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Click to add photos or ZIP files, or drop them here"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
        <p className="text-sm">Click to add photos or drop images / ZIP files here</p>
        <p className="text-xs text-muted-foreground" role="status">
          One ZIP per class keeps same-named photos apart. {zipProgress !== null && `Reading archive… ${Math.round(zipProgress * 100)}%`}
        </p>
      </div>

      {/* Photo libraries */}
      {libraries.length > 0 && (
        <ul className="mb-3 space-y-1.5" aria-label="Photo libraries">
          {libraries.map((library) => (
            <li
              key={library.id}
              className="flex items-start justify-between gap-2 rounded-md border bg-surface-card px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-medium" title={library.name}>
                  {library.kind === 'zip' && (
                    <FileArchive className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  )}
                  {library.name}
                </p>
                <p
                  className="text-[11px] text-muted-foreground"
                  title={
                    library.skipped && library.skipped.length > 0
                      ? library.skipped
                          .slice(0, 10)
                          .map((entry) => `${entry.name}: ${entry.reason}`)
                          .join('\n')
                      : undefined
                  }
                >
                  {library.photos.length} photo(s)
                  {library.skipped && library.skipped.length > 0
                    ? ` · ${library.skipped.length} skipped`
                    : ''}
                </p>
                {library.warnings?.map((warning) => (
                  <p key={warning} className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {warning}
                  </p>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove photo library ${library.name}`}
                title={`Remove ${library.name}`}
                onClick={() => setLibraryToRemove(library)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Source → library mapping */}
      {libraries.length > 0 && sources.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium">Photos for each data source</p>
          <div className="themed-scrollbar max-h-44 space-y-1 overflow-auto rounded-md border bg-surface-card p-2">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[11px]',
                    source.error ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  title={source.label}
                >
                  {source.label}
                </span>
                <Select
                  aria-label={`Photo library for ${source.label}`}
                  className="h-7 max-w-40 text-[11px]"
                  value={photoSourceMap[source.id] ?? ''}
                  disabled={Boolean(source.error)}
                  onChange={(event) => mapPhotoLibrary(source.id, event.target.value)}
                >
                  <option value="">
                    {libraries.length === 1 ? 'Auto (the only library)' : 'No photos'}
                  </option>
                  {libraries.map((library) => (
                    <option key={library.id} value={library.id}>
                      {library.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          {unmappedSources.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              {unmappedSources.length} source(s) have no photo library — their cards will be
              generated with blank photos.
            </p>
          )}
        </div>
      )}

      {/* Matching strategy — the three photo mapping modes */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="photo-match-mode" className="mb-1 block text-xs text-muted-foreground">
            Photo mapping mode
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
            <option value="filename">By card-holder name (photo named after person)</option>
            <option value="column" disabled={!photoColumnSource}>
              By Excel column (photo-name column)
            </option>
            <option value="manual">Manual (pick per record)</option>
          </Select>
        </div>
        {matchConfig.mode === 'column' && photoColumnSource && (
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
              {photoColumnSource.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {matchConfig.mode === 'filename' && (
        <p className="mb-2 text-xs text-muted-foreground">
          Matches each row's name against photo file names inside its mapped library. Spaces,
          underscores and letter case are ignored.
        </p>
      )}
      {matchConfig.mode === 'column' && (
        <p className="mb-2 text-xs text-muted-foreground">
          The chosen column must contain the photo file name (extension optional). Matching stays
          inside each source's own library.
        </p>
      )}
      {matchConfig.mode === 'manual' && (
        <p className="mb-2 text-xs text-muted-foreground">
          Pick a photo for each record in the Data &amp; Validation table below (or on the Data
          page). Photo thumbnails are shown here for reference.
        </p>
      )}

      {photos.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {matchedCount} of {photos.length} photos matched to rows in the active source
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

      <ConfirmDialog
        open={confirmClear}
        title="Remove all photos?"
        description={`${photos.length} photo(s) from ${libraries.length} library(ies) are discarded, together with their source mappings. Re-import the files to bring them back.`}
        confirmLabel="Remove all photos"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clearPhotos();
        }}
      />

      <ConfirmDialog
        open={libraryToRemove !== null}
        title={`Remove "${libraryToRemove?.name ?? ''}"?`}
        description={`Its ${libraryToRemove?.photos.length ?? 0} photo(s) are discarded and any data source mapped to it loses its photos. Re-import the archive to bring it back.`}
        confirmLabel="Remove library"
        destructive
        onCancel={() => setLibraryToRemove(null)}
        onConfirm={() => {
          const library = libraryToRemove;
          setLibraryToRemove(null);
          if (library) removePhotoLibrary(library.id);
        }}
      />

      {photoError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {photoError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.zip"
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
