/**
 * In-browser font loading service (v0.4.2).
 *
 * Lets placeholder AND static text render with the exact fonts authored in
 * the PSD:
 * - Users drag-drop / pick .ttf/.otf/.woff/.woff2 files.
 * - Files are loaded via the FontFace API and persisted in IndexedDB
 *   (offline-first, per AGENTS.md).
 * - PSD font names (PostScript names like "ArialMT") are matched against
 *   loaded families so the composite service can request the right family.
 */
import { saveFontRecord, deleteFontRecord, listFontRecords, type FontRecord } from './storageService';
import arimoRegularUrl from '@/assets/fonts/arimo-regular.ttf?url';
import arimoBoldUrl from '@/assets/fonts/arimo-bold.ttf?url';
import arimoItalicUrl from '@/assets/fonts/arimo-italic.ttf?url';
import arimoBoldItalicUrl from '@/assets/fonts/arimo-bolditalic.ttf?url';

/** Supported font file extensions */
const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

/**
 * Bundled Arial-metric-compatible font (Arimo, SIL OFL 1.1). Registered under
 * the real family names PSD files reference so `ArialMT`/`Arial` text renders
 * identically without any user upload.
 */
const BUNDLED_FACES: { family: string; url: string; weight: string; style: string }[] = [
  { family: 'Arimo', url: arimoRegularUrl, weight: '400', style: 'normal' },
  { family: 'Arimo', url: arimoBoldUrl, weight: '700', style: 'normal' },
  { family: 'Arimo', url: arimoItalicUrl, weight: '400', style: 'italic' },
  { family: 'Arimo', url: arimoBoldItalicUrl, weight: '700', style: 'italic' },
  { family: 'Arial', url: arimoRegularUrl, weight: '400', style: 'normal' },
  { family: 'Arial', url: arimoBoldUrl, weight: '700', style: 'normal' },
  { family: 'Arial', url: arimoItalicUrl, weight: '400', style: 'italic' },
  { family: 'Arial', url: arimoBoldItalicUrl, weight: '700', style: 'italic' },
  { family: 'ArialMT', url: arimoRegularUrl, weight: '400', style: 'normal' },
  { family: 'ArialMT', url: arimoBoldUrl, weight: '700', style: 'normal' },
  { family: 'Arial-BoldMT', url: arimoBoldUrl, weight: '700', style: 'normal' },
  { family: 'Arial-ItalicMT', url: arimoItalicUrl, weight: '400', style: 'italic' },
  { family: 'Arial-BoldItalicMT', url: arimoBoldItalicUrl, weight: '700', style: 'italic' },
];

/** True once the bundled fonts have been fetched and registered */
let bundledFontsLoaded = false;

/** A font available to the app (loaded into the document) */
export interface LoadedFont {
  /** Family name used in CSS `font-family` and canvas font strings */
  family: string;
  /** Original file name */
  fileName: string;
  /** True when the font was auto-matched to a PSD layer font */
  matchedPsdFonts: string[];
}

/** Registry of family → FontFace (so we don't double-load) */
const loadedFamilies = new Map<string, FontFace>();

/** Listener set notified whenever the font registry changes */
const listeners = new Set<() => void>();

/** Subscribe to font-registry changes; returns an unsubscribe function */
export function subscribeToFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** True when the file looks like a font we can load */
export function isSupportedFontFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return FONT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Normalise a PostScript/PSD font name to a comparable key:
 * "ArialMT" → "arialmt", "Arial-BoldMT" → "arialboldmt".
 */
export function normaliseFontName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]/g, '');
}

/** Strip style suffixes to compare base family names: "Arial-BoldMT" → "arial" */
export function baseFamilyKeyOf(name: string): string {
  return normaliseFontName(
    name
      .replace(/-(Bold|Italic|Oblique|Regular|Light|Medium|Heavy|Black|Thin|Condensed|Extended).*$/i, '')
      .replace(/(Bold|Italic|Oblique|Regular|Light|Medium|Heavy|Black|Thin)$/i, '')
      .replace(/MT$/i, '')
  );
}

/**
 * Match a PSD font name (e.g. "ArialMT") against a loaded family.
 * Exact normalised match first, then base-family match (so "Arial" covers
 * "ArialMT" and "Arial-BoldMT").
 *
 * @param psdFontName - Font name extracted from the PSD text style
 * @param loadedFamiliesList - Families currently registered in the app
 * @returns The matching family name, or null
 */
export function matchPsdFont(psdFontName: string, loadedFamiliesList: string[]): string | null {
  if (!psdFontName) return null;
  const target = normaliseFontName(psdFontName);
  const targetBase = baseFamilyKeyOf(psdFontName);
  for (const family of loadedFamiliesList) {
    if (normaliseFontName(family) === target) return family;
  }
  for (const family of loadedFamiliesList) {
    if (baseFamilyKeyOf(family) === targetBase && targetBase.length > 0) return family;
  }
  return null;
}

/**
 * Load font file bytes into the document via the FontFace API.
 *
 * @param family - CSS family name to register under
 * @param buffer - Raw font file bytes
 * @returns True when the font was registered
 */
export function registerFontFace(family: string, buffer: ArrayBuffer): boolean {
  if (loadedFamilies.has(family)) return true;
  try {
    const fontFace = new FontFace(family, buffer);
    void fontFace
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        loadedFamilies.set(family, loaded);
        notify();
      })
      .catch(() => {
        // Invalid font file — ignore.
      });
    // Optimistically record the family; the async load will confirm.
    loadedFamilies.set(family, fontFace);
    return true;
  } catch {
    return false;
  }
}

/**
 * Import font files: load them into the document and persist to IndexedDB.
 *
 * @param files - Font files (.ttf/.otf/.woff/.woff2)
 * @returns Families successfully registered
 */
export async function importFontFiles(files: FileList | File[]): Promise<string[]> {
  const imported: string[] = [];
  for (const file of Array.from(files)) {
    if (!isSupportedFontFile(file)) continue;
    const family = file.name.replace(/\.[^.]+$/, '');
    const buffer = await file.arrayBuffer();
    if (!registerFontFace(family, buffer)) continue;
    const record: FontRecord = {
      name: family,
      fileName: file.name,
      buffer,
      addedDate: new Date().toISOString(),
    };
    try {
      await saveFontRecord(record);
    } catch {
      // Persistence failure shouldn't block the in-session font.
    }
    imported.push(family);
  }
  notify();
  return imported;
}

/** Families currently registered in the document */
export function listLoadedFontFamilies(): string[] {
  return [...loadedFamilies.keys()];
}

/**
 * Restore all persisted fonts from IndexedDB into the document and register
 * the bundled Arial-compatible faces. Call once at app start (before any
 * previews render).
 */
export async function restoreFontsFromStorage(): Promise<string[]> {
  let records: FontRecord[] = [];
  try {
    records = await listFontRecords();
  } catch {
    records = [];
  }
  for (const record of records) {
    registerFontFace(record.name, record.buffer);
  }
  await ensureBundledFonts();
  return records.map((record) => record.name);
}

/**
 * Register the bundled Arimo faces (once per session). They are also aliased
 * under the `Arial`/`ArialMT` family names PSD files use, so text renders
 * with matching metrics even when the user never uploads a font.
 */
export async function ensureBundledFonts(): Promise<void> {
  if (bundledFontsLoaded) return;
  bundledFontsLoaded = true;
  for (const face of BUNDLED_FACES) {
    try {
      const response = await fetch(face.url);
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      const fontFace = new FontFace(face.family, buffer, {
        weight: face.weight,
        style: face.style,
      });
      await fontFace.load();
      document.fonts.add(fontFace);
      loadedFamilies.set(face.family, fontFace);
    } catch {
      // Bundled font failed (e.g. offline before precache) — the browser
      // falls back to its installed Arial; no user action needed.
    }
  }
  notify();
}

/**
 * Delete a font: remove from the document and from IndexedDB.
 *
 * @param family - Family name to remove
 */
export async function removeFont(family: string): Promise<void> {
  const fontFace = loadedFamilies.get(family);
  if (fontFace) {
    document.fonts.delete(fontFace);
    loadedFamilies.delete(family);
  }
  try {
    await deleteFontRecord(family);
  } catch {
    // Ignore storage errors; the in-session removal already happened.
  }
  notify();
}

/**
 * Resolve the CSS font family string for a PSD font name: returns the
 * matched custom family (quoted) when available, otherwise the PSD name
 * itself so the browser can fall back to its own installed copy.
 *
 * @param psdFontName - Font name from the PSD (may be undefined)
 * @returns CSS font-family value (quoted where needed)
 */
export function resolveFontFamily(psdFontName: string | undefined): string {
  if (!psdFontName) return 'sans-serif';
  const matched = matchPsdFont(psdFontName, listLoadedFontFamilies());
  if (matched) return `"${matched}"`;
  // Fall back to the PSD name for browser-installed fonts, then sans-serif.
  return `"${psdFontName.replace(/"/g, '')}", sans-serif`;
}
