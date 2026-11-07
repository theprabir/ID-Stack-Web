import { useState } from 'react';
import {
  Github,
  User,
  Mail,
  Instagram,
  ShieldCheck,
  Scale,
  ArrowUpRight,
  Code2,
  Check,
  Globe,
  Terminal,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
// v0.6.13: sourced from package.json at build time (was hardcoded '0.6.3'
// and never updated). The Footer chip already uses the same constant.
import { APP_VERSION } from '@/constants/app';
const APP_AUTHOR_NAME = 'Prabir kumar Das';
const APP_AUTHOR_GITHUB = 'https://github.com/theprabir';
const APP_REPO_URL = 'https://github.com/theprabir/id-stack-web';
const AUTHOR_EMAIL = 'prabirishere@gmail.com';
const AUTHOR_INSTAGRAM = 'https://www.instagram.com/theprabir';
const LIPIKA_URL = 'https://lipika.co.in';

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-4 pb-2 border-b border-border">
      <div>
        <h2 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {badge && (
        <span className="self-start sm:self-auto text-[10px] sm:text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {badge}
        </span>
      )}
    </div>
  );
}

export function AboutPage(): JSX.Element {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const handleCopyEmail = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(AUTHOR_EMAIL);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = AUTHOR_EMAIL;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2200);
    } catch {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2200);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8 p-3.5 sm:p-6 lg:p-8 font-sans antialiased text-foreground overflow-x-hidden">
      <header className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-surface-panel to-surface-deepest p-4 sm:p-6 lg:p-8 shadow-sm">
        <div className="absolute -top-24 -right-24 h-48 sm:h-64 w-48 sm:w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 sm:h-64 w-48 sm:w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <span className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-secondary border border-border overflow-hidden shrink-0 shadow-sm">
              <img
                src="/favicon.ico"
                alt="ID Stack Logo"
                className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  ID Stack
                </h1>
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary border border-border text-muted-foreground">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-normal">
                Open-source browser ID card designer & batch printing studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border justify-between md:justify-end">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>100% Client-Side</span>
            </span>
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 active:scale-[0.98] text-primary-foreground px-3.5 py-1.5 text-xs font-medium transition-all shadow-sm"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
              <ArrowUpRight className="h-3 w-3 opacity-70" />
            </a>
          </div>
        </div>
      </header>

      <section>
        <SectionHeader
          title="Creator & Maintainer"
          subtitle="The developer behind ID Stack and related open-source tools"
          badge="Author Profile"
        />

        <div className="rounded-xl sm:rounded-2xl border border-border bg-surface-panel p-4 sm:p-6 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            {/* Creator Avatar */}
            <div className="relative shrink-0">
              {!avatarFailed ? (
                <img
                  src="/author.png"
                  alt={APP_AUTHOR_NAME}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-indigo-500/30 object-cover shadow-md"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-2 border-indigo-500/30 bg-indigo-500/10 text-primary">
                  <User className="h-8 w-8 sm:h-10 sm:w-10" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-indigo-600 text-white border-2 border-surface-panel shadow">
                <Code2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </div>
            </div>

            {/* Creator Bio & Links */}
            <div className="flex-1 text-center sm:text-left space-y-2.5 sm:space-y-3 min-w-0 w-full">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                  {APP_AUTHOR_NAME}
                </h3>
                <p className="text-xs font-medium text-primary mt-0.5">
                  Open Source Developer & AI/ML Enthusiast
                </p>
              </div>

              <p className="text-xs text-foreground/80 leading-relaxed max-w-2xl">
                Specializes in privacy-first, browser-executed software, publishing tools, and
                custom font rendering engines.
              </p>

              {/* Action Buttons */}
              <div className="pt-1 sm:pt-2 flex flex-row flex-wrap items-stretch sm:items-center justify-center sm:justify-start gap-2">
                <a
                  href={APP_AUTHOR_GITHUB}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary hover:bg-muted active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-foreground transition-all"
                >
                  <Github className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>GitHub Profile</span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </a>

                <a
                  href={AUTHOR_INSTAGRAM}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary hover:bg-muted active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-foreground transition-all"
                >
                  <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Instagram</span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </a>
                <button
                  onClick={handleCopyEmail}
                  type="button"
                  title={AUTHOR_EMAIL}
                  aria-label={copiedEmail ? 'Email copied' : `Copy email ${AUTHOR_EMAIL}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-primary transition-all"
                >
                  {copiedEmail ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span>{AUTHOR_EMAIL}</span>
                  {copiedEmail && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      Copied
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Featured Projects"
          subtitle="Software applications developed and maintained by the author"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* ID Stack Card */}
          <div className="rounded-xl sm:rounded-2xl border border-border bg-surface-panel p-4 sm:p-6 flex flex-col justify-between hover:border-primary/40 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary border border-border overflow-hidden shrink-0 shadow-sm">
                    <img
                      src="/favicon.ico"
                      alt="ID Stack Logo"
                      className="h-6 w-6 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground truncate">ID Stack</h3>
                    <p className="text-[11px] text-muted-foreground truncate">Card Design & Printing</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  MIT
                </span>
              </div>

              <p className="text-xs text-foreground/80 leading-relaxed">
                A browser-based ID card design suite with PSD layer import, batch Excel data
                binding, and print-ready imposed PDF exporting.
              </p>

              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Client-side PSD parser & canvas renderer</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Batch Excel merge & auto-layout imposition</span>
                </div>
              </div>
            </div>

            <div className="mt-5 sm:mt-6 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono text-[11px]">Version {APP_VERSION}</span>
              <a
                href={APP_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:text-primary font-medium transition-colors"
              >
                <span>Repository</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Lipika Project Card */}
          <div className="rounded-xl sm:rounded-2xl border border-border bg-surface-panel p-4 sm:p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary border border-border overflow-hidden shrink-0 shadow-sm">
                    <img
                      src="https://www.google.com/s2/favicons?domain=lipika.co.in&sz=128"
                      alt="Lipika Logo"
                      className="h-6 w-6 object-contain rounded-sm"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground truncate">Lipika</h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Odia Publishing & Font Tool
                    </p>
                  </div>
                </div>
                <a
                  href={LIPIKA_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 active:scale-[0.98] text-primary-foreground text-xs font-medium transition-all shadow-sm"
                >
                  <span>Visit</span>
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>

              <p className="text-xs text-foreground/80 leading-relaxed">
                Professional Odia text converter for Unicode ↔ Akruti / Sreelipi fonts with
                press-grade DTP accuracy and Windows glyph fixes.
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Odia DTP', 'Akruti', 'Sreelipi', 'Unicode', 'Glyph Fix'].map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-2 py-0.5 rounded bg-secondary text-foreground/80 border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 sm:mt-6 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono text-[11px]">lipika.co.in</span>
              <a
                href={LIPIKA_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:text-primary font-medium transition-colors"
              >
                <span>Open App</span>
                <Globe className="h-3 w-3 ml-0.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Technical Standards"
          subtitle="Core architectural principles applied across tools"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          <div className="rounded-xl border border-border bg-surface-panel p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">100% In-Browser</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Your files and photos never touch external servers. Processing occurs entirely
              locally.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-panel p-4">
            <div className="flex items-center gap-2 text-primary mb-1.5">
              <Scale className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">Open Source MIT</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Free to inspect, extend, and adapt for institutional or commercial print workflows.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-panel p-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-primary mb-1.5">
              <Cpu className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">Fast Performance</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Engineered with modern Web APIs for seamless batch canvas rendering.
            </p>
          </div>
        </div>
      </section>

      <footer className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <Terminal className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            Designed & built by <strong className="text-foreground">{APP_AUTHOR_NAME}</strong>
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-muted-foreground">
          <a
            href={APP_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <span>•</span>
          <a
            href={LIPIKA_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            Lipika
          </a>
          <span>•</span>
          <a
            href={AUTHOR_INSTAGRAM}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            Instagram
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-foreground py-4 sm:py-8">
      <AboutPage />
    </div>
  );
}
