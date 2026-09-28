import { describe, it, expect } from 'vitest';
import {
  matchPsdFont,
  normaliseFontName,
  baseFamilyKeyOf,
  isSupportedFontFile,
  resolveFontFamily,
} from '@/services/fontService';

describe('fontService — font name normalisation', () => {
  it('lowercases and strips separators', () => {
    expect(normaliseFontName('ArialMT')).toBe('arialmt');
    expect(normaliseFontName('Open Sans-Bold')).toBe('opensansbold');
  });

  it('strips PostScript style suffixes for base comparison', () => {
    expect(baseFamilyKeyOf('Arial-BoldMT')).toBe('arial');
    expect(baseFamilyKeyOf('ArialMT')).toBe('arial');
    expect(baseFamilyKeyOf('HelveticaNeue-Light')).toBe('helveticaneue');
  });
});

describe('fontService — PSD font matching', () => {
  it('matches exact normalised names first', () => {
    expect(matchPsdFont('ArialMT', ['ArialMT'])).toBe('ArialMT');
    expect(matchPsdFont('arial mt', ['Arial MT'])).toBe('Arial MT');
  });

  it('matches base families so one upload covers all styles', () => {
    expect(matchPsdFont('ArialMT', ['Arial'])).toBe('Arial');
    expect(matchPsdFont('Arial-BoldMT', ['Arial'])).toBe('Arial');
  });

  it('returns null when nothing matches', () => {
    expect(matchPsdFont('ComicSansMS', ['Arial', 'Verdana'])).toBeNull();
    expect(matchPsdFont('', ['Arial'])).toBeNull();
  });
});

describe('fontService — file gating', () => {
  it('accepts supported font extensions', () => {
    expect(isSupportedFontFile(new File([], 'x.ttf'))).toBe(true);
    expect(isSupportedFontFile(new File([], 'x.otf'))).toBe(true);
    expect(isSupportedFontFile(new File([], 'x.woff2'))).toBe(true);
  });

  it('rejects non-font files', () => {
    expect(isSupportedFontFile(new File([], 'x.png'))).toBe(false);
    expect(isSupportedFontFile(new File([], 'x.psd'))).toBe(false);
  });
});

describe('fontService — humanised PostScript fallback (v0.6.9)', () => {
  it('"ArialNarrow" resolves to the humanised width family first, bare Arial second', () => {
    // The old code emitted the raw PostScript name — unresolvable in a
    // browser, so canvas text silently fell back to generic sans-serif and
    // wrapped with the wrong metrics. The humanised candidates hit the
    // OS-installed "Arial Narrow" (or the closest bundled alias) instead.
    const css = resolveFontFamily('ArialNarrow');
    expect(css.startsWith('"Arial Narrow", "Arial", ')).toBe(true);
    expect(css.endsWith(', sans-serif')).toBe(true);
  });

  it('"Arial-BoldMT" strips the style suffix so the bundled Arial alias matches first', () => {
    const css = resolveFontFamily('Arial-BoldMT');
    expect(css.startsWith('"Arial", ')).toBe(true);
    // The raw PostScript name stays as a late candidate for custom fonts
    // registered under exactly that name.
    expect(css).toContain('"Arial-BoldMT"');
  });

  it('"HelveticaNeue-Light" offers the bare humanised base before the raw name', () => {
    const css = resolveFontFamily('HelveticaNeue-Light');
    // CamelCase splits: "Helvetica Neue" (+ weight word "Light" stripped).
    expect(css.startsWith('"Helvetica Neue", ')).toBe(true);
  });

  it('undefined still resolves to plain sans-serif', () => {
    expect(resolveFontFamily(undefined)).toBe('sans-serif');
  });
});
