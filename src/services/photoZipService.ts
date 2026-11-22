/**
 * ZIP photo libraries (v0.7.6).
 *
 * A school may hand over one folder of photos per class, compressed as one
 * ZIP each. Importing them all into a single flat list makes two classes with
 * the same pupil names collide. This service extracts a ZIP into its own
 * `PhotoLibrary` so every data source can be matched against its own archive
 * only.
 *
 * Extraction runs entirely in the webview (JSZip is already bundled); nothing
 * is uploaded and no native plugin is involved.
 */
import JSZip from 'jszip';
import type { ExcelSource, PhotoLibrary, PhotoRecord } from '@/types/data';
import { generateId } from '@/utils/id';
import { photoBaseName, readImageSize } from './photoService';

/** Supported image extensions inside an archive */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

/** Soft warning threshold (the archive is held in memory while reading) */
export const ZIP_WARN_BYTES = 300 * 1024 * 1024;
/** Hard refusal threshold — larger archives risk exhausting the tab */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

/** True when a dropped file is a ZIP archive */
export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}

/** Why an archive entry is not a photo (null when it is one) */
function skipReason(entryName: string): string | null {
  const base = entryName.split(/[\\/]/).pop() ?? entryName;
  if (entryName.startsWith('__MACOSX/')) return 'macOS metadata';
  if (!base || base.startsWith('.')) return 'hidden/system file';
  if (/^(thumbs\.db|desktop\.ini)$/i.test(base)) return 'Windows metadata';
  const lower = base.toLowerCase();
  if (lower.endsWith('.zip')) return 'nested archive';
  if (!IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return 'not an image';
  }
  return null;
}

/** MIME type from an image extension */
function mimeFor(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

/**
 * Normalise a ZIP or source name for smart mapping.
 * "Class 5 Photos.zip", "class_5", "CLASS-5 (1).zip" → "class5".
 *
 * @param value - ZIP name or source base name
 * @returns Comparable key ('' when nothing remains)
 */
export function normalizeLibraryKey(value: string): string {
  return value
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/%(20|2f)/g, ' ')
    .replace(/\b(photos?|images?|pics?|pictures?)\b/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/-?\s*copy$/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(photos?|images?|pics?)$/g, '');
}

/**
 * Extract one ZIP into a photo library.
 *
 * Images keep their base name for matching (nested folders are flattened).
 * Non-image and metadata entries are skipped and reported; duplicate base
 * names are kept as separate records and flagged, so a manual pick can
 * resolve the ambiguity instead of one photo silently disappearing.
 *
 * @param file - ZIP archive chosen/dropped by the user
 * @param onProgress - Optional progress callback (0–1)
 * @returns Extracted library
 * @throws Error when the archive is too large, encrypted or unreadable
 */
export async function extractPhotoLibrary(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<PhotoLibrary> {
  if (file.size > ZIP_MAX_BYTES) {
    throw new Error(
      `"${file.name}" is larger than 1 GB. Split it into smaller ZIP archives (one per class).`
    );
  }

  const libraryId = generateId();
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(
      `Could not open "${file.name}". ${
        /encrypt/i.test(String(error)) ? 'Password-protected archives are not supported.' : 'The file is not a valid ZIP archive.'
      }`
    );
  }

  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  const photos: PhotoRecord[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const nameCounts = new Map<string, number>();
  const warnings: string[] = [];
  if (file.size > ZIP_WARN_BYTES) {
    warnings.push(
      `This archive is ${Math.round(file.size / (1024 * 1024))} MB; reading it may take a moment.`
    );
  }

  let processed = 0;
  /** Report progress at most every 10 entries (avoids hundreds of renders) */
  const report = (): void => {
    if (processed === entries.length || processed % 10 === 0) {
      onProgress?.(processed / Math.max(1, entries.length));
    }
  };
  for (const entry of entries) {
    processed += 1;
    const reason = skipReason(entry.name);
    if (reason) {
      skipped.push({ name: entry.name, reason });
      report();
      continue;
    }

    const base = entry.name.split(/[\\/]/).pop() ?? entry.name;
    try {
      const blob = await entry.async('blob');
      const typed = new File([blob], base, { type: mimeFor(base) });
      const { width, height } = await readImageSize(typed);
      if (width === 0 || height === 0) {
        // A corrupt image must not become a matched photo: generation would
        // fail on that row instead of reporting it as a missing photo.
        skipped.push({ name: entry.name, reason: 'unreadable image' });
        report();
        continue;
      }
      const baseName = photoBaseName(base);
      nameCounts.set(baseName, (nameCounts.get(baseName) ?? 0) + 1);
      photos.push({
        id: generateId(),
        fileName: base,
        baseName,
        blobUrl: URL.createObjectURL(typed),
        file: typed,
        width,
        height,
        libraryId,
      });
    } catch {
      skipped.push({ name: entry.name, reason: 'unreadable image' });
    }
    report();
  }

  for (const [baseName, count] of nameCounts) {
    if (count > 1) warnings.push(`"${baseName}" appears ${count} times — pick the right photo manually.`);
  }
  if (photos.length === 0) {
    throw new Error(
      `"${file.name}" contains no readable supported images (.jpg, .png, .webp…).`
    );
  }

  return {
    id: libraryId,
    kind: 'zip',
    name: file.name,
    photos,
    skipped,
    warnings,
  };
}

/**
 * Suggest a 1:1 mapping from libraries to data sources using exact normalised
 * name matches only. A key that matches more than one source or library is
 * left for the user, never guessed.
 *
 * @param sources - Imported data sources
 * @param libraries - Imported photo libraries
 * @returns sourceId → libraryId for the unambiguous exact matches
 */
export function autoMapLibraries(
  sources: ExcelSource[],
  libraries: PhotoLibrary[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const libraryKeys = libraries.map((library) => ({
    library,
    keys: [normalizeLibraryKey(library.name)],
  }));

  /** Candidates per source and per library: a match must be unique both ways */
  const bySource = new Map<string, Set<string>>();
  const byLibrary = new Map<string, Set<string>>();

  for (const source of sources) {
    if (source.error) continue;
    const sourceKeys = new Set(
      [normalizeLibraryKey(source.baseName), normalizeLibraryKey(source.fileName)].filter(Boolean)
    );
    const sourceCandidates = bySource.get(source.id) ?? new Set<string>();
    for (const { library, keys } of libraryKeys) {
      if (!keys.some((key) => key.length > 0 && sourceKeys.has(key))) continue;
      sourceCandidates.add(library.id);
      const libraryCandidates = byLibrary.get(library.id) ?? new Set<string>();
      libraryCandidates.add(source.id);
      byLibrary.set(library.id, libraryCandidates);
    }
    bySource.set(source.id, sourceCandidates);
  }

  for (const [sourceId, libraryIds] of bySource) {
    if (libraryIds.size !== 1) continue;
    const libraryId = [...libraryIds][0]!;
    // One library matching a whole workbook's file name would otherwise be
    // claimed by its first sheet and silently starve the other sheets.
    if (byLibrary.get(libraryId)?.size === 1) {
      mapping[sourceId] = libraryId;
    }
  }

  return mapping;
}
