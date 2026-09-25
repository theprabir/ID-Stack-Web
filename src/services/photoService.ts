import type { PhotoRecord, PhotoMatchConfig, PhotoMatchResult, DataRow } from '@/types/data';
import { generateId } from '@/utils/id';

/** Accepted image extensions for photo import */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

/**
 * Check whether a file looks like an image we can import.
 * @param file - Candidate file
 * @returns True when the extension is a supported image type
 */
export function isSupportedImage(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

/**
 * Extract the matching key from a file name: no extension, lowercased.
 * "John_Smith.JPG" → "john_smith"
 * @param fileName - Raw file name
 * @returns Normalised base name
 */
export function photoBaseName(fileName: string): string {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  return withoutPath
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .trim();
}

/**
 * Read intrinsic dimensions of an image file.
 * @param file - Image file
 * @returns Width and height in pixels (0×0 when unreadable)
 */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (width: number, height: number): void => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    image.onload = () => finish(image.naturalWidth, image.naturalHeight);
    image.onerror = () => finish(0, 0);
    image.src = url;
  });
}

/**
 * Load image files into PhotoRecords with dimensions and blob URLs.
 * Unsupported files are skipped; unreadable ones get 0×0 dimensions.
 * Remember to revoke `blobUrl` when the record is discarded.
 *
 * @param files - Files from input/drag-drop
 * @returns Loaded photo records
 */
export async function loadPhotos(files: FileList | File[]): Promise<PhotoRecord[]> {
  const records: PhotoRecord[] = [];
  for (const file of Array.from(files)) {
    if (!isSupportedImage(file)) continue;
    const { width, height } = await readImageSize(file);
    records.push({
      id: generateId(),
      fileName: file.name,
      baseName: photoBaseName(file.name),
      blobUrl: URL.createObjectURL(file),
      file,
      width,
      height,
    });
  }
  return records;
} /**
 * Normalise a row value into a photo matching key.
 * Strips extension and lowercases so "Photos/john.jpg" matches "john".
 * @param value - Raw cell value
 * @returns Normalised key ('' when empty)
 */
export function normaliseMatchKey(value: string): string {
  const fileName = value.split(/[\\/]/).pop() ?? value;
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .trim();
}

/**
 * Fuzzy-normalise a name for lenient photo matching.
 * "John  Smith Jr." → "johnsmithjr" — removes spaces, underscores, hyphens,
 * dots and apostrophes so "john smith" matches "John_Smith.jpg" and vice
 * versa. Used as a fallback when exact base-name matching fails.
 *
 * @param value - Raw name or file name
 * @returns Normalised fuzzy key
 */
export function fuzzyMatchKey(value: string): string {
  const base = normaliseMatchKey(value);
  return base.replace(/[\s_\-.']/g, '');
}

/**
 * Find a photo for a raw cell/file-name value with progressive leniency:
 * 1. exact base-name match ("john smith" === "john smith.jpg")
 * 2. fuzzy match ignoring spaces/underscores/hyphens/dots ("john_smith"
 *    matches "John Smith", "john  smith" matches "johnsmith.jpg")
 *
 * @param value - Raw cell value or file name
 * @param photoByKey - Exact base-name index
 * @param fuzzyByKey - Fuzzy normalised index
 * @param usedPhotoIds - Photo ids already assigned (skipped)
 * @returns Matched photo or undefined
 */
function findPhotoLenient(
  value: string,
  photoByKey: Map<string, PhotoRecord>,
  fuzzyByKey: Map<string, PhotoRecord>,
  usedPhotoIds: Set<string>
): PhotoRecord | undefined {
  const exact = photoByKey.get(normaliseMatchKey(value));
  if (exact && !usedPhotoIds.has(exact.id)) return exact;

  const fuzzy = fuzzyByKey.get(fuzzyMatchKey(value));
  if (fuzzy && !usedPhotoIds.has(fuzzy.id)) return fuzzy;

  return undefined;
}

/**
 * Match photos to data rows according to the configured strategy.
 *
 * - 'filename': row's first mapped/available value that equals a photo base name
 * - 'column': row cell in `config.columnName` holds the photo file name
 * - 'manual': explicit rowIndex → photoId assignments
 *
 * @param rows - Data rows to match
 * @param photos - Loaded photos
 * @param config - Matching configuration
 * @returns Assignments plus unmatched rows / unused photos
 */
export function matchPhotos(
  rows: DataRow[],
  photos: PhotoRecord[],
  config: PhotoMatchConfig
): PhotoMatchResult {
  const assignments = new Map<number, PhotoRecord>();
  const usedPhotoIds = new Set<string>();

  const photoByKey = new Map(photos.map((photo) => [photo.baseName, photo]));
  /** Fuzzy index for lenient fallback matching (spaces/underscores/case) */
  const fuzzyByKey = new Map<string, PhotoRecord>();
  for (const photo of photos) {
    const key = fuzzyMatchKey(photo.fileName);
    if (key && !fuzzyByKey.has(key)) fuzzyByKey.set(key, photo);
  }

  if (config.mode === 'manual') {
    for (const row of rows) {
      const photoId = config.manualAssignments?.[row.rowIndex];
      if (!photoId) continue;
      const photo = photos.find((candidate) => candidate.id === photoId);
      if (photo) {
        assignments.set(row.rowIndex, photo);
        usedPhotoIds.add(photo.id);
      }
    }
  } else if (config.mode === 'column') {
    const columnName = config.columnName ?? '';
    for (const row of rows) {
      const rawValue = row.values[columnName] ?? '';
      if (!rawValue) continue;
      const photo = findPhotoLenient(rawValue, photoByKey, fuzzyByKey, usedPhotoIds);
      if (photo) {
        assignments.set(row.rowIndex, photo);
        usedPhotoIds.add(photo.id);
      }
    }
  } else {
    // 'filename' mode: try every column's value as a photo name, first match wins.
    for (const row of rows) {
      for (const value of Object.values(row.values)) {
        if (!value) continue;
        const photo = findPhotoLenient(value, photoByKey, fuzzyByKey, usedPhotoIds);
        if (photo) {
          assignments.set(row.rowIndex, photo);
          usedPhotoIds.add(photo.id);
          break;
        }
      }
    }
  }

  const unmatchedRowIndexes = rows
    .map((row) => row.rowIndex)
    .filter((rowIndex) => !assignments.has(rowIndex));

  const unusedPhotoNames = photos
    .filter((photo) => !usedPhotoIds.has(photo.id))
    .map((photo) => photo.fileName);

  return { assignments, unmatchedRowIndexes, unusedPhotoNames };
}

/**
 * Process a photo for a placeholder: centre-crop to the target aspect ratio
 * and scale to the target pixel size. Uses the regular Canvas API (works in
 * all supported browsers); OffscreenCanvas batch rendering comes in Phase 4.
 *
 * @param photo - Source photo
 * @param targetWidthPx - Desired output width in pixels
 * @param targetHeightPx - Desired output height in pixels
 * @param outputType - Output MIME type (default image/jpeg, quality 0.92)
 * @returns Processed image blob
 * @throws Error when the photo has no readable dimensions
 */
export async function processPhoto(
  photo: PhotoRecord,
  targetWidthPx: number,
  targetHeightPx: number,
  outputType = 'image/jpeg'
): Promise<Blob> {
  if (photo.width === 0 || photo.height === 0) {
    throw new Error(`Cannot process unreadable image "${photo.fileName}".`);
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Failed to decode "${photo.fileName}".`));
    element.src = photo.blobUrl;
  });

  // Centre-crop to target aspect ratio.
  const targetAspect = targetWidthPx / targetHeightPx;
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let cropWidth = image.naturalWidth;
  let cropHeight = image.naturalHeight;
  if (sourceAspect > targetAspect) {
    cropWidth = Math.round(image.naturalHeight * targetAspect);
  } else {
    cropHeight = Math.round(image.naturalWidth / targetAspect);
  }
  const cropX = Math.round((image.naturalWidth - cropWidth) / 2);
  const cropY = Math.round((image.naturalHeight - cropHeight) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidthPx,
    targetHeightPx
  );

  const quality = outputType === 'image/jpeg' ? 0.92 : undefined;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas.toBlob returned null.'));
        }
      },
      outputType,
      quality
    );
  });
}

/**
 * Revoke all blob URLs of photo records (memory management).
 * @param photos - Records to clean up
 */
export function disposePhotos(photos: PhotoRecord[]): void {
  for (const photo of photos) {
    if (photo.blobUrl) {
      URL.revokeObjectURL(photo.blobUrl);
    }
  }
}
