import { describe, it, expect } from 'vitest';
import {
  matchPsdFont,
  normaliseFontName,
  baseFamilyKeyOf,
  isSupportedFontFile,
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
