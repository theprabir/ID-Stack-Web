import { useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { markdownComponents } from './markdownTheme';
import type { DocGuide } from './guides';

interface GuideReaderProps {
  /** The guide to render */
  guide: DocGuide;
  /** Navigate back to the guides list */
  onBack: () => void;
}

/** Heading ids collected from a rendered markdown document */
export interface GuideTocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * In-app guide reader: renders a bundled markdown document with the themed
 * markdown map. Scrolls to top on open; back returns to the guides list.
 */
export function GuideReader({ guide, onBack }: GuideReaderProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll whenever a different guide opens.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [guide.id]);

  const rendered = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {guide.source}
      </ReactMarkdown>
    ),
    [guide.source]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Reader header */}
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
          aria-label="Back to all guides"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All guides
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{guide.name}</h2>
        <a
          href={guide.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
          title="Open the markdown source on GitHub"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Source
        </a>
      </div>

      {/* Document body */}
      <div
        ref={scrollRef}
        className="themed-scrollbar min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-8"
      >
        <div className="mx-auto max-w-3xl pb-16">{rendered}</div>
      </div>
    </div>
  );
}
