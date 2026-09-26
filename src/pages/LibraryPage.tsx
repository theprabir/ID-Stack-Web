import { LayoutGrid } from 'lucide-react';

/**
 * Template library page. Pre-designed templates arrive in Phase 5.
 */
export function LibraryPage(): JSX.Element {
  return (
    <div className="flex h-full flex-col p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Template Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ready-made card designs you can open and edit.
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-surface-panel">
          <LayoutGrid className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">No templates yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pre-designed templates arrive in Phase 5. Until then, start from the PSD Studio or
            design from scratch in the Editor.
          </p>
        </div>
      </div>
    </div>
  );
}
