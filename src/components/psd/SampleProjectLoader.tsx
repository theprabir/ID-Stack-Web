import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { loadDemoProject } from '@/services/sampleProjectService';
import { Button } from '@/components/ui';

interface SampleProjectLoaderProps {
  /** Called after the demo project has been loaded (advances to the placeholder step) */
  onLoaded?: () => void;
}

/**
 * One-click demo: loads the bundled ABC Company employee card (front + back
 * PSDs + employee sheet + photos) and wires placeholders, mappings and photo
 * matching, so a first-time user sees a finished card without preparing
 * any files (v0.7.4).
 */
export function SampleProjectLoader({ onLoaded }: SampleProjectLoaderProps): JSX.Element {
  const hasDesign = usePsdStore((state) => Boolean(state.project.front || state.project.back));
  const hasData = useDataStore((state) => Boolean(state.excelData));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    if (hasDesign || hasData) {
      const confirmed = window.confirm(
        'Open the demo project? This replaces the current designs, data and mappings.'
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    setStatus('Preparing the demo project…');
    try {
      await loadDemoProject(setStatus);
      onLoaded?.();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The demo project failed to load.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
      aria-labelledby="sample-project-title"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="sample-project-title" className="text-sm font-semibold">
          Open the demo ID card
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Loads a sample employee card — front and back PSDs, Excel sheet and photos — with
          placeholders and columns already mapped.
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? (status ?? 'Loading…') : 'Open demo project'}
      </Button>
    </section>
  );
}
