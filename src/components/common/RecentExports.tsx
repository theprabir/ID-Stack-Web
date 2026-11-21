import { FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useRecentExports } from '@/hooks/useRecentExports';
import {
  clearRecentExports,
  formatBytes,
  revealExportPath,
  type ExportRecord,
} from '@/services/exportService';

/** Short local timestamp for one export */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Where one export went, phrased for the build that produced it */
function destination(entry: ExportRecord): string {
  if (entry.status === 'failed') return entry.error ?? 'Save failed';
  if (entry.path) return entry.path;
  return 'Downloads folder (browser build)';
}

/**
 * The last exports the app wrote, newest first (v0.7.5).
 *
 * This is the answer to "where did my PDFs go?": every native save is recorded
 * with its absolute path and can be revealed in Explorer. The list lives in
 * localStorage only — clearing it never deletes the files.
 */
export function RecentExports(): JSX.Element {
  const exports = useRecentExports();

  if (exports.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No exports yet. Every batch, PDF, CSV or diagnostics file you save is listed here with the
        folder it went to.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border bg-surface-card/60">
        {exports.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium" title={entry.fileName}>
                {entry.fileName}
              </p>
              <p
                className="mt-0.5 truncate text-[11px] text-muted-foreground"
                title={destination(entry)}
              >
                {formatWhen(entry.savedAt)} · {formatBytes(entry.bytes)} · {destination(entry)}
              </p>
            </div>
            {entry.status === 'saved' && entry.path && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void revealExportPath(entry.path as string)}
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Show
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={clearRecentExports}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Clear list
      </Button>
    </div>
  );
}
