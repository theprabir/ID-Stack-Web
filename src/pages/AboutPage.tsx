import React, { useState } from 'react';
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

const APP_VERSION = '0.6.3';
const APP_AUTHOR_NAME = 'Prabir kumar Das';
const APP_AUTHOR_GITHUB = 'https://github.com/theprabir';
const APP_REPO_URL = 'https://github.com/theprabir/idstack';
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-4 pb-2 border-b border-slate-800/60">
      <div>
        <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {badge && (
        <span className="self-start sm:self-auto text-[10px] sm:text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
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
    <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8 p-3.5 sm:p-6 lg:p-8 font-sans antialiased text-slate-100 overflow-x-hidden">
      
      <header className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-4 sm:p-6 lg:p-8 shadow-sm">
        <div className="absolute -top-24 -right-24 h-48 sm:h-64 w-48 sm:w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 sm:h-64 w-48 sm:w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <span className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-slate-800/90 border border-slate-700/80 overflow-hidden shrink-0 shadow-sm">
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
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">ID Stack</h1>
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-normal">
                Open-source browser ID card designer & batch printing studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60 justify-between md:justify-end">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>100% Client-Side</span>
            </span>
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white px-3.5 py-1.5 text-xs font-medium transition-all shadow-sm"
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

        <div className="rounded-xl sm:rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 shadow-sm hover:border-slate-700/80 transition-colors">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            
            {/* Creator Avatar */}
            <div className="relative shrink-0">
              {!avatarFailed ? (
                <img
                  src={`${APP_AUTHOR_GITHUB}.png`}
                  alt={APP_AUTHOR_NAME}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-indigo-500/30 object-cover shadow-md"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-2 border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                  <User className="h-8 w-8 sm:h-10 sm:w-10" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-indigo-600 text-white border-2 border-slate-900 shadow">
                <Code2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </div>
            </div>

            {/* Creator Bio & Links */}
            <div className="flex-1 text-center sm:text-left space-y-2.5 sm:space-y-3 min-w-0 w-full">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">{APP_AUTHOR_NAME}</h3>
                <p className="text-xs font-medium text-indigo-400 mt-0.5">
                  Software Engineer & Open Source Developer
                </p>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                Specializes in privacy-first, browser-executed software, publishing tools, and custom font rendering engines.
              </p>

              {/* Action Buttons */}
              <div className="pt-1 sm:pt-2 flex flex-col xs:flex-row flex-wrap items-stretch sm:items-center justify-center sm:justify-start gap-2">
                <a
                  href={APP_AUTHOR_GITHUB}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/70 hover:bg-slate-700 active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-slate-300 transition-all"
                >
                  <Github className="h-3.5 w-3.5 text-slate-400" />
                  <span>GitHub Profile</span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </a>

                <a
                  href={AUTHOR_INSTAGRAM}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/70 hover:bg-slate-700 active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-slate-300 transition-all"
                >
                  <Instagram className="h-3.5 w-3.5 text-slate-400" />
                  <span>Instagram</span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </a>

                <button
                  onClick={handleCopyEmail}
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-[0.98] px-3 py-2 sm:py-1.5 text-xs font-medium text-indigo-300 transition-all"
                >
                  {copiedEmail ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Email Copied!</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="truncate">Copy Email ({AUTHOR_EMAIL})</span>
                    </>
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
          <div className="rounded-xl sm:rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 flex flex-col justify-between hover:border-slate-700/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/90 border border-slate-700/80 overflow-hidden shrink-0 shadow-sm">
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
                    <h3 className="text-base font-bold text-white truncate">ID Stack</h3>
                    <p className="text-[11px] text-slate-400 truncate">Card Design & Printing</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  MIT
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                A browser-based ID card design suite with PSD layer import, batch Excel data binding, and print-ready imposed PDF exporting.
              </p>

              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Client-side PSD parser & canvas renderer</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Batch Excel merge & auto-layout imposition</span>
                </div>
              </div>
            </div>

            <div className="mt-5 sm:mt-6 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Version {APP_VERSION}</span>
              <a
                href={APP_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                <span>Repository</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Lipika Project Card */}
          <div className="rounded-xl sm:rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/90 border border-slate-700/80 overflow-hidden shrink-0 shadow-sm">
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
                    <h3 className="text-base font-bold text-white truncate">Lipika</h3>
                    <p className="text-[11px] text-slate-400 truncate">Odia Publishing & Font Tool</p>
                  </div>
                </div>
                <a
                  href={LIPIKA_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-medium transition-all shadow-sm"
                >
                  <span>Visit</span>
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Professional Odia text converter for Unicode ↔ Akruti / Sreelipi fonts with press-grade DTP accuracy and Windows glyph fixes.
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Odia DTP', 'Akruti', 'Sreelipi', 'Unicode', 'Glyph Fix'].map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 sm:mt-6 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono text-[11px]">lipika.co.in</span>
              <a
                href={LIPIKA_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
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
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-slate-200">100% In-Browser</h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Your files and photos never touch external servers. Processing occurs entirely locally.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 text-indigo-400 mb-1.5">
              <Scale className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-slate-200">Open Source MIT</h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Free to inspect, extend, and adapt for institutional or commercial print workflows.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-indigo-400 mb-1.5">
              <Cpu className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-semibold text-slate-200">Fast Performance</h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Engineered with modern Web APIs for seamless batch canvas rendering.
            </p>
          </div>
        </div>
      </section>

      <footer className="pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <Terminal className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span>Designed & built by <strong className="text-slate-200">{APP_AUTHOR_NAME}</strong></span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-slate-400">
          <a
            href={APP_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <span>•</span>
          <a
            href={LIPIKA_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-white transition-colors"
          >
            Lipika
          </a>
          <span>•</span>
          <a
            href={AUTHOR_INSTAGRAM}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-white transition-colors"
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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-4 sm:py-8">
      <AboutPage />
    </div>
  );
}