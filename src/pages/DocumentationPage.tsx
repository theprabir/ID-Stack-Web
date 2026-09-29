import {
  BookOpen,
  Code2,
  Keyboard,
  LifeBuoy,
  FileText,
  Rocket,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

/** One guide row rendered as a documentation card */
interface DocGuide {
  /** Absolute URL to the guide (GitHub, so it works from the deployed app) */
  href: string;
  Icon: typeof BookOpen;
  name: string;
  audience: string;
  description: string;
}

const REPO_DOCS = 'https://github.com/theprabir/ID-Stack-Web/blob/main';

/** The guides shipped in docs/, plus the changelog and repo */
const GUIDES: DocGuide[] = [
  {
    href: `${REPO_DOCS}/docs/user_manual.md`,
    Icon: BookOpen,
    name: 'User manual',
    audience: 'Users',
    description:
      'Every page and workflow: the PSD Studio wizard, uploads, placeholder picking, column mapping, batch generation and printing.',
  },
  {
    href: `${REPO_DOCS}/docs/troubleshooting.md`,
    Icon: LifeBuoy,
    name: 'Troubleshooting',
    audience: 'Users',
    description:
      'Symptom-first fixes for parsing, fonts, photos, generation and printing problems.',
  },
  {
    href: `${REPO_DOCS}/docs/keyboard_shortcuts.md`,
    Icon: Keyboard,
    name: 'Keyboard shortcuts',
    audience: 'Everyone',
    description: 'The (currently minimal) PSD Studio keyboard reference — what works today.',
  },
  {
    href: `${REPO_DOCS}/docs/developer_manual.md`,
    Icon: Code2,
    name: 'Developer manual',
    audience: 'Contributors',
    description:
      'Stack, architecture, services, data flow, PSD/CMYK/imposition internals, testing and release process.',
  },
  {
    href: `${REPO_DOCS}/CHANGELOG.md`,
    Icon: FileText,
    name: 'Changelog',
    audience: 'Everyone',
    description: 'What changed in every release, newest first.',
  },
];

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
 * In-app documentation hub: quick-start summary plus links to the full
 * guides (user manual, troubleshooting, shortcuts, developer manual and
 * the changelog) hosted in the repository.
 */
export function DocumentationPage(): JSX.Element {
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
              Markdown sources live in the repository's docs/ folder.
            </p>
          </div>
        </div>
        <ul className="divide-y px-2 py-2">
          {GUIDES.map(({ href, Icon, name, audience, description }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/10"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {audience}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                </span>
                <ExternalLink
                  className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
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
              ID Stack is 100% client-side — designs, data and photos never leave your device. The
              documentation links above open the project's public repository.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
