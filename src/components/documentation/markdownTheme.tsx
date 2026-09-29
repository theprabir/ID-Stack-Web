import { isValidElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Components } from 'react-markdown';
import { GUIDES } from './guides';

/** Extract plain text from React children (used for heading anchor slugs) */
function nodeText(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(nodeText).join('');
  if (isValidElement(value)) {
    return nodeText((value.props as { children?: ReactNode }).children);
  }
  return '';
}

/** GitHub-style anchor slug for a heading's text (keeps unicode letters) */
function headingId(children: ReactNode): string {
  return nodeText(children)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * Resolve a markdown link target to an in-app guide when it points at one of
 * the bundled documents (e.g. "troubleshooting.md" cross-references).
 */
function guideIdForHref(href: string | undefined): string | null {
  if (typeof href !== 'string') return null;
  const target = href.split('/').pop()?.toLowerCase() ?? '';
  const guide = GUIDES.find((entry) => `${entry.id}.md` === target);
  return guide ? guide.id : null;
}

/**
 * Styled markdown element map for the in-app manual renderer. Every element
 * uses the app's theme tokens so guides render cleanly in dark and light.
 */
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 id={headingId(children)} className="mb-3 mt-2 border-b pb-2 text-xl font-semibold">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 id={headingId(children)} className="mb-2 mt-8 text-lg font-semibold">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(children)} className="mb-2 mt-6 text-base font-semibold">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 id={headingId(children)} className="mb-1 mt-4 text-sm font-semibold">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 id={headingId(children)} className="mb-1 mt-4 text-sm font-semibold">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 id={headingId(children)} className="mb-1 mt-4 text-xs font-semibold">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-3 text-sm leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children, node: _node, ...rest }) => {
    const external = typeof href === 'string' && /^https?:/i.test(href);
    const guideId = guideIdForHref(href);
    const className =
      'text-primary underline underline-offset-2 transition-opacity hover:opacity-80';
    if (guideId) {
      return (
        <Link to={`/documentation?guide=${guideId}`} className={className} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
        className={className}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border" />,
  code: ({ className, children, node: _node, ...rest }) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    return (
      <code
        {...rest}
        className={
          isBlock
            ? 'font-mono text-xs'
            : 'rounded border bg-accent/10 px-1 py-0.5 font-mono text-[0.85em]'
        }
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border bg-surface-card p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children, node: _node, ...rest }) => (
    <th {...rest} className="border bg-surface-card px-2 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children, node: _node, ...rest }) => (
    <td {...rest} className="border px-2 py-1.5 align-top">
      {children}
    </td>
  ),
  img: ({ alt, node: _node, ...rest }) => (
    <img alt={alt ?? ''} {...rest} className="max-w-full rounded-lg border" />
  ),
};
