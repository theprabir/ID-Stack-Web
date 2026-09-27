import { ShieldCheck, Github } from 'lucide-react';
import { VERSION } from '@/services/version';

/**
 * Bottom status bar.
 * - Left: product tagline + version (v0.6.7 — auto-updates from
 *   package.json on every release), hidden on the smallest screens.
 * - Right: privacy badge (hidden below desktop width) and the creator
 *   credit with a GitHub profile link — centred when the tagline is
 *   hidden so the credit never leans left on phone-sized screens.
 */
export function Footer(): JSX.Element {
  return (
    <footer className="flex h-8 items-center justify-between border-t bg-surface-panel px-4 text-xs text-muted-foreground transition-colors duration-300">
      <span className="hidden items-center gap-1.5 sm:flex">
        <span>ID Card Designer</span>
        <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] leading-tight text-muted-foreground">
          v{VERSION}
        </span>
      </span>
      <span className="flex items-center gap-4 max-sm:w-full max-sm:justify-center">
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
