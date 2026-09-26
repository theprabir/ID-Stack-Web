import { ShieldCheck, Github } from 'lucide-react';

/**
 * Bottom status bar.
 * - Left: product tagline (hidden on the smallest screens to save space).
 * - Right: privacy badge (hidden on tablets/phones to avoid crowding) and
 *   the creator credit with a GitHub profile link — always visible.
 */
export function Footer(): JSX.Element {
  return (
    <footer className="flex h-8 items-center justify-between border-t bg-surface-panel px-4 text-xs text-muted-foreground transition-colors duration-300">
      <span className="hidden sm:inline">ID Card Designer</span>
      <span className="flex items-center gap-4">
        <span
          className="hidden items-center gap-1 lg:flex"
          title="All processing happens in your browser"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          100% client-side
        </span>
        <span className="flex items-center gap-1.5">
          <span>Created by Prabir kumar Das</span>
          <a
            href="https://github.com/theprabir"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Prabir kumar Das on GitHub"
            className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </span>
      </span>
    </footer>
  );
}
