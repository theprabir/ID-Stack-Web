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
import {
  saveFontRecord,
  deleteFontRecord,
  listFontRecords,
  type FontRecord,
} from './storageService';
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

/**
 * PostScript name → registered family (e.g. "MyriadPro-Bold" → family the
 * user uploaded as "MyriadPro Bold"). Populated by preloadFontsForText so
 * resolveFontFamily can hit the EXACT font embedded in the PSD even when
 * the family name differs from the PostScript name.
 */
const postScriptAliasFamilies = new Map<string, string>();

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
      .replace(
        /-(Bold|Italic|Oblique|Regular|Light|Medium|Heavy|Black|Thin|Condensed|Extended).*$/i,
        ''
      )
      .replace(/(Bold|Italic|Oblique|Regular|Light|Medium|Heavy|Black|Thin)$/i, '')
      .replace(/MT$/i, '')
  );
}

/**
 * Match a PSD font name (e.g. "ArialMT") against a loaded family.
 * Exact normalised match first, then base-family match (so "Arial" covers
 * "ArialMT" and "Arial-BoldMT"), then PostScript aliases recorded when a
 * font's binary was inspected at registration time.
 *
 * @param psdFontName - Font name extracted from the PSD text style
 * @param loadedFamiliesList - Families currently registered in the app
 * @returns The matching family name, or null
 */
export function matchPsdFont(psdFontName: string, loadedFamiliesList: string[]): string | null {
  if (!psdFontName) return null;
  const target = normaliseFontName(psdFontName);
  for (const family of loadedFamiliesList) {
    if (normaliseFontName(family) === target) return family;
  }
  const base = baseFamilyKeyOf(psdFontName);
  if (base.length > 0) {
    for (const family of loadedFamiliesList) {
      if (baseFamilyKeyOf(family) === base) return family;
    }
  }
  // Exact PostScript alias registered by the preload step.
  const alias = postScriptAliasFamilies.get(normaliseFontName(psdFontName));
  if (alias && loadedFamiliesList.includes(alias)) return alias;
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
 */ export async function importFontFiles(files: FileList | File[]): Promise<string[]> {
  const imported: string[] = [];
  for (const file of Array.from(files)) {
    if (!isSupportedFontFile(file)) continue;
    const family = file.name.replace(/\.[^.]+$/, '');
    const buffer = await file.arrayBuffer();
    if (!registerFontFace(family, buffer)) continue;
    registerPostScriptAlias(family, buffer);
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
    registerPostScriptAlias(record.name, record.buffer);
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

/**
 * Build the EXACT CSS font shorthand for one text run — the single source
 * of truth shared by measurement and painting (a mismatch silently
 * mis-centres text). Weight and style come from the PSD engine data, size
 * in px, family is the resolved match for the embedded PostScript name.
 *
 * @param bold - Engine bold (faux or name-derived)
 * @param italic - Engine italic (faux or name-derived)
 * @param sizePx - Font size in px
 * @param family - Resolved CSS font family
 * @param weight - Numeric CSS weight (default: bold ? 700 : 400)
 * @returns CSS font shorthand for canvas `font`
 */
export function exactFontCss(
  bold: boolean,
  italic: boolean,
  sizePx: number,
  family: string,
  weight?: number
): string {
  const style = italic ? 'italic ' : '';
  const resolvedWeight = weight ?? (bold ? 700 : 400);
  return `${style}${resolvedWeight} ${sizePx}px ${family}`;
}

/**
 * PRELOAD the exact fonts a design's text layers reference BEFORE any
 * canvas measurement or painting. Canvas text renders with the LAST set
 * font string; without an awaited `document.fonts.load` the first layout
 * pass measures (and often paints) with a fallback font, mis-wrapping and
 * mis-centering every placeholder until a re-render happens to be lucky.
 *
 * For every PostScript name embedded in the PSD this resolves the matching
 * registered family (uploaded font / bundled alias) and loads ALL faces of
 * it at the referenced sizes. Returns the set of families that could NOT be
 * resolved so the caller can surface a user-facing warning.
 *
 * @param postScriptNames - Every font name embedded in the parsed PSD
 * @param sizesPx - Font sizes referenced by the design (loading is per size)
 * @param boldItalicVariants - Style variants to load (default: regular+bold)
 * @returns Families referenced by the design but not available
 */
export async function preloadFontsForText(
  postScriptNames: (string | undefined)[],
  sizesPx: number[] = [16],
  boldItalicVariants: Array<{ bold: boolean; italic: boolean }> = [
    { bold: false, italic: false },
    { bold: true, italic: false },
  ]
): Promise<string[]> {
  const uniqueNames = [...new Set(postScriptNames.filter((name): name is string => Boolean(name)))];
  const missing: string[] = [];
  for (const name of uniqueNames) {
    const matched = matchPsdFont(name, listLoadedFontFamilies());
    if (!matched) {
      missing.push(name);
      continue;
    }
    for (const variant of boldItalicVariants) {
      for (const size of sizesPx) {
        const css = exactFontCss(variant.bold, variant.italic, size, `"${matched}"`);
        try {
          await document.fonts.load(css, 'AgÜ0');
        } catch {
          // Invalid font string / unsupported font — the browser falls back.
        }
      }
    }
  }
  return missing;
}

/**
 * Inspect a font binary's name table for its PostScript name (name ID 6)
 * and record a family alias so PSD-embedded PostScript names resolve even
 * when the user's file/registration name differs (e.g. the file says
 * "MyriadPro Bold.ttf" but the embedded name is "MyriadPro-Bold").
 *
 * @param family - Family the font was registered under
 * @param buffer - Raw font file bytes
 */
export function registerPostScriptAlias(family: string, buffer: ArrayBuffer): void {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint32(0) !== 0x00010000) return; // not TrueType
    const tableCount = view.getUint16(4);
    let nameOffset = -1;
    for (let index = 0; index < tableCount; index += 1) {
      const record = 12 + index * 16;
      if (view.getUint32(record) === 0x6e616d65) {
        // 'name'
        nameOffset = view.getUint32(record + 8);
        break;
      }
    }
    if (nameOffset < 0) return;
    const count = view.getUint16(nameOffset + 2);
    const stringOffset = nameOffset + view.getUint16(nameOffset + 4);
    for (let index = 0; index < count; index += 1) {
      const record = nameOffset + 6 + index * 12;
      const platform = view.getUint16(record);
      const nameId = view.getUint16(record + 6);
      const length = view.getUint16(record + 8);
      const offset = view.getUint16(record + 10);
      if (nameId !== 6) continue; // PostScript name
      const bytes = new Uint8Array(buffer, stringOffset + offset, length);
      let decoded: string;
      if (platform === 1 || platform === 0) {
        decoded = String.fromCharCode(...bytes);
      } else {
        decoded = new TextDecoder('utf-16be').decode(bytes);
      }
      postScriptAliasFamilies.set(normaliseFontName(decoded), family);
      return;
    }
  } catch {
    // Malformed name table — the family still resolves by name matching.
  }
}

/**
 * Application bootstrap: restore persisted fonts + bundled Arial-compatible
 * faces BEFORE any card preview or batch render. Called from main.tsx so
 * the font registry is guaranteed ready regardless of which page mounts
 * first (the old code only restored fonts when the FontManager panel was
 * open — placeholder text rendered in fallback fonts on every other path).
 */
export async function bootstrapFonts(): Promise<void> {
  await restoreFontsFromStorage();
}
