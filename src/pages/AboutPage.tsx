import {
  Github,
  User,
  ExternalLink,
  Mail,
  Instagram,
  IdCard,
  ShieldCheck,
  Scale,
  Languages,
  ArrowUpRight,
  Heart,
} from 'lucide-react';
import { Label } from '@/components/ui';
import { APP_VERSION } from '@/constants/app';
import { APP_AUTHOR_NAME, APP_AUTHOR_GITHUB, APP_REPO_URL } from '@/constants/app';

/** Author contact + project links */
const AUTHOR_EMAIL = 'mailto:prabirishere@gmail.com';
const AUTHOR_INSTAGRAM = 'https://www.instagram.com/theprabir';
const LIPIKA_URL = 'https://lipika.co.in';

/** One labelled settings-style section card (matches SettingsPage) */
function AboutSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Github;
  title: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section
      className="rounded-xl border bg-surface-panel transition-colors duration-300"
      aria-labelledby={`about-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id={`about-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            className="text-sm font-semibold"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** One row in a link list: icon, label, value/link */
function ContactRow({
  icon: Icon,
  label,
  href,
  linkText,
  external = true,
}: {
  icon: typeof Github;
  label: string;
  href: string;
  linkText: string;
  external?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-surface-card">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{linkText}</p>
        </div>
      </div>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        {external ? 'Open' : 'Copy'}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * About page: app overview, author credits with contact links, and the
 * author's other projects. Matches the Settings page section style.
 */
export function AboutPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">About</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who makes ID Stack and what else they build.
        </p>
      </div>

      {/* The app */}
      <AboutSection
        icon={IdCard}
        title="ID Stack"
        description={`Version ${APP_VERSION} · MIT License`}
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            A professional, open-source ID card design and batch printing software that runs
            entirely in your browser — PSD-first workflow, Excel data, imposed print-ready PDFs.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              100% client-side
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              MIT License
            </span>
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              Source on GitHub
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </AboutSection>

      {/* Credits + contact */}
      <AboutSection
        icon={User}
        title="Credits"
        description={`Designed and maintained by ${APP_AUTHOR_NAME}`}
      >
        <div className="divide-y">
          <ContactRow
            icon={User}
            label={APP_AUTHOR_NAME}
            linkText={`GitHub · ${APP_AUTHOR_GITHUB.replace('https://', '')}`}
            href={APP_AUTHOR_GITHUB}
          />
          <ContactRow
            icon={Mail}
            label="Email"
            linkText="prabirishere@gmail.com"
            href={AUTHOR_EMAIL}
            external={false}
          />
          <ContactRow
            icon={Instagram}
            label="Instagram"
            linkText="@theprabir"
            href={AUTHOR_INSTAGRAM}
          />
        </div>
      </AboutSection>

      {/* Other projects */}
      <AboutSection
        icon={Heart}
        title="Other projects"
        description="More tools from the same author"
      >
        <div className="rounded-lg border bg-surface-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Languages className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Lipika
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    Web app
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">lipika.co.in</p>
              </div>
            </div>
            <a
              href={LIPIKA_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Visit Lipika
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Professional Odia publishing tool — a Unicode ↔ Akruti / Sreelipi text converter with
            press-grade accuracy for DTP operators, printing presses and publishers. Handles complex
            ligatures and conjuncts in both directions, includes a Windows glyph fix for correct
            Odia font rendering on Windows 10/11, and converts right in your browser with a free
            tier and simple pay-as-you-go pricing.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Odia', 'Akruti', 'Sreelipi', 'Unicode', 'DTP'].map((tag) => (
              <Label
                key={tag}
                className="rounded-full border bg-surface-panel px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </Label>
            ))}
          </div>
        </div>
      </AboutSection>
    </div>
  );
}
