import { WifiOff, ShieldCheck } from 'lucide-react';

/**
 * Bottom status bar with privacy/offline badges.
 */
export function Footer(): JSX.Element {
  return (
    <footer className="flex h-8 items-center justify-between border-t bg-surface-panel px-4 text-xs text-muted-foreground transition-colors duration-300">
      <span>Design &amp; print ID cards — right in your browser</span>
      <span className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          100% client-side
        </span>
        <span className="flex items-center gap-1">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Offline ready
        </span>
      </span>
    </footer>
  );
}
