import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Code2,
  Keyboard,
  LifeBuoy,
  FileText,
  Rocket,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { GuideReader } from '@/components/documentation/GuideReader';
import { GUIDES, findGuide } from '@/components/documentation/guides';
import type { DocGuide } from '@/components/documentation/guides';

/** Maps a guide's registry icon key to its lucide component */
const GUIDE_ICONS: Record<DocGuide['Icon'], typeof BookOpen> = {
  book: BookOpen,
  lifebuoy: LifeBuoy,
  keyboard: Keyboard,
  code: Code2,
  file: FileText,
};

/** The workflow in three short steps, for the quick-start strip */
const QUICK_START = [
  {
    Icon: Rocket,
    title: 'Upload',
    description: 'Drop in your PSD designs, the Excel sheet and the photos in Step 1.',
  },
  {
    Icon: BookOpen,
    title: 'Mark placeholders',
    description: 'Pick the text and photo layers that change per card in Step 2.',
  },
  {
    Icon: FileText,
    title: 'Generate',
    description: 'Map columns, preview a live card, then export the batch in Step 3.',
  },
];

/**
 * In-app documentation hub: quick-start summary, then the full guides
 * (user manual, troubleshooting, shortcuts, developer manual, changelog)
 * rendered right here from the markdown bundled at build time. Opening a
 * guide sets `?guide=<id>` so links are shareable; the browser back button
 * returns to the list.
 */
export function DocumentationPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeGuide = findGuide(searchParams.get('guide'));

  const openGuide = useCallback(
    (id: string) => {
      setSearchParams({ guide: id }, { replace: false });
    },
    [setSearchParams]
  );

  const closeGuide = useCallback(() => {
    setSearchParams({}, { replace: false });
  }, [setSearchParams]);

  if (activeGuide) {
    return (
      <div className="mx-auto h-full max-w-5xl p-4 sm:p-6">
        <div className="h-[calc(100vh-13rem)] overflow-hidden rounded-xl border bg-surface-panel transition-colors duration-300">
          <GuideReader guide={activeGuide} onBack={closeGuide} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold">Documentation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guides and references for ID Stack — from your first card to the full batch print run.
        </p>
      </div>

      {/* Quick start */}
      <section
        className="rounded-xl border bg-surface-panel transition-colors duration-300"
        aria-labelledby="docs-quick-start"
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Rocket className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="docs-quick-start" className="text-sm font-semibold">
              Quick start
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The whole workflow is the PSD Studio wizard on the home page.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-3">
          {QUICK_START.map(({ Icon, title, description }) => (
            <div key={title} className="rounded-lg border bg-surface-card p-3">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="mt-1.5 text-xs font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guides */}
      <section
        className="rounded-xl border bg-surface-panel transition-colors duration-300"
        aria-labelledby="docs-guides"
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="docs-guides" className="text-sm font-semibold">
              Guides &amp; references
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Read them right here — the markdown sources live in the repository's docs/ folder.
            </p>
          </div>
        </div>
        <ul className="divide-y px-2 py-2">
          {GUIDES.map((guide) => {
            const Icon = GUIDE_ICONS[guide.Icon];
            return (
              <li key={guide.id}>
                <button
                  type="button"
                  onClick={() => openGuide(guide.id)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/10"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{guide.name}</span>
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {guide.audience}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {guide.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Privacy note */}
      <section
        className="rounded-xl border bg-surface-panel px-5 py-4 transition-colors duration-300"
        aria-labelledby="docs-privacy"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="docs-privacy" className="text-sm font-semibold">
              Privacy first
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ID Stack is 100% client-side — designs, data and photos never leave your device. All
              documentation is bundled with the app and rendered locally.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
