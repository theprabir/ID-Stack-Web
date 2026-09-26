import { useEffect, useState, useSyncExternalStore } from 'react';
import { Type, Trash2, Loader2 } from 'lucide-react';
import {
  importFontFiles,
  removeFont,
  restoreFontsFromStorage,
  listLoadedFontFamilies,
  subscribeToFonts,
  isSupportedFontFile,
} from '@/services/fontService';
import { Button } from '@/components/ui';

/** Sync the component to the font registry (external store pattern) */
function useFontFamilies(): string[] {
  const version = useSyncExternalStore(
    subscribeToFonts,
    () => listLoadedFontFamilies().join('\u0000'),
    () => ''
  );
  void version;
  return listLoadedFontFamilies();
}

/**
 * Font manager panel: upload .ttf/.otf/.woff/.woff2 files so placeholder and
 * static text render with the exact fonts used in the PSD. Fonts persist in
 * IndexedDB and reload automatically on startup.
 */
export function FontManager(): JSX.Element {
  const families = useFontFamilies();
  const [isRestoring, setIsRestoring] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void restoreFontsFromStorage().finally(() => {
      if (!cancelled) setIsRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    setNotice(null);
    try {
      const supported = Array.from(files).filter(isSupportedFontFile);
      const imported = await importFontFiles(supported);
      const skipped = files.length - imported.length;
      const parts: string[] = [];
      if (imported.length > 0) parts.push(`Loaded ${imported.join(', ')}`);
      if (skipped > 0) parts.push(`${skipped} file(s) skipped (unsupported or invalid)`);
      setNotice(parts.join(' · ') || null);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section
      className="rounded-lg border bg-surface-panel p-4 transition-colors duration-300"
      aria-labelledby="font-manager-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <Type className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="font-manager-title" className="text-sm font-semibold">
          Fonts
        </h2>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Type className="h-4 w-4" aria-hidden="true" />}
        Upload font files (.ttf, .otf, .woff, .woff2)
        <input
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {isRestoring ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Restoring fonts…
        </p>
      ) : families.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {families.map((family) => (
            <li key={family} className="flex items-center justify-between rounded border bg-surface-card px-2 py-1.5 text-xs">
              <span style={{ fontFamily: `"${family}"` }}>{family}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => void removeFont(family)}
                aria-label={`Remove font ${family}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        !notice && (
          <p className="mt-2 text-xs text-muted-foreground">
            Text renders with browser fonts until the PSD's fonts are uploaded.
          </p>
        )
      )}

      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
    </section>
  );
}
