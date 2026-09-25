import { LayoutGrid } from 'lucide-react';

/**
 * Template library page. Pre-designed templates arrive in Phase 5.
 */
export function LibraryPage(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <LayoutGrid className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Template Library</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Pre-designed templates arrive in Phase 5.
      </p>
    </div>
  );
}
