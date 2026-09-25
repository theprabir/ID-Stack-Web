import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isSupportedImage,
  photoBaseName,
  normaliseMatchKey,
  fuzzyMatchKey,
  loadPhotos,
  matchPhotos,
  processPhoto,
  disposePhotos,
} from '@/services/photoService';
import type { PhotoRecord, DataRow } from '@/types/data';

/** Build a fake photo record without touching files */
function makePhoto(
  id: string,
  fileName: string,
  overrides: Partial<PhotoRecord> = {}
): PhotoRecord {
  return {
    id,
    fileName,
    baseName: photoBaseName(fileName),
    blobUrl: `blob:${id}`,
    file: new File([], fileName),
    width: 300,
    height: 400,
    ...overrides,
  };
}

function makeRow(rowIndex: number, values: Record<string, string>): DataRow {
  return { rowIndex, values };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('photoService — helpers', () => {
  it('isSupportedImage accepts only image extensions', () => {
    expect(isSupportedImage(new File([], 'a.jpg'))).toBe(true);
    expect(isSupportedImage(new File([], 'a.JPEG'))).toBe(true);
    expect(isSupportedImage(new File([], 'a.png'))).toBe(true);
    expect(isSupportedImage(new File([], 'a.webp'))).toBe(true);
    expect(isSupportedImage(new File([], 'a.pdf'))).toBe(false);
  });

  it('photoBaseName strips extension and path and lowercases', () => {
    expect(photoBaseName('John_Smith.JPG')).toBe('john_smith');
    expect(photoBaseName('C:\\Photos\\Asha.PNG')).toBe('asha');
    expect(photoBaseName('/home/user/ravi.jpeg')).toBe('ravi');
  });

  it('normaliseMatchKey matches photoBaseName for path+extension values', () => {
    expect(normaliseMatchKey('Photos/john.jpg')).toBe('john');
    expect(normaliseMatchKey('JOHN.JPG')).toBe('john');
  });

  it('fuzzyMatchKey removes spaces, underscores, hyphens, dots and case', () => {
    expect(fuzzyMatchKey('John Smith')).toBe('johnsmith');
    expect(fuzzyMatchKey('john_smith.jpg')).toBe('johnsmith');
    expect(fuzzyMatchKey('John-Smith.PNG')).toBe('johnsmith');
    expect(fuzzyMatchKey("O'Brien  Jr.")).toBe('obrienjr');
  });
});

describe('photoService — loadPhotos', () => {
  it('skips non-image files and creates records with blob URLs', async () => {
    // loadPhotos accepts FileList | File[] — jsdom has no DataTransfer, use an array.
    const files = [
      new File([new Uint8Array([1])], 'one.jpg'),
      new File([new Uint8Array([1])], 'two.txt'),
    ];
    const records = await loadPhotos(files);
    expect(records).toHaveLength(1);
    expect(records[0]?.fileName).toBe('one.jpg');
    expect(records[0]?.blobUrl).toMatch(/^blob:/);
    disposePhotos(records); // no throw
  });
});

describe('photoService — matchPhotos', () => {
  const photos = [
    makePhoto('p1', 'asha.jpg'),
    makePhoto('p2', 'ravi.png'),
    makePhoto('p3', 'mina.jpeg'),
  ];
  const rows = [
    makeRow(0, { Name: 'Asha', PhotoFile: 'asha.jpg' }),
    makeRow(1, { Name: 'Ravi', PhotoFile: 'photos/ravi.png' }),
    makeRow(2, { Name: 'Nobody', PhotoFile: 'ghost.jpg' }),
  ];

  it('mode column matches by cell value (path/extension tolerant)', () => {
    const result = matchPhotos(rows, photos, { mode: 'column', columnName: 'PhotoFile' });
    expect(result.assignments.get(0)?.id).toBe('p1');
    expect(result.assignments.get(1)?.id).toBe('p2');
    expect(result.assignments.get(2)).toBeUndefined();
    expect(result.unmatchedRowIndexes).toEqual([2]);
    expect(result.unusedPhotoNames).toEqual(['mina.jpeg']);
  });

  it('mode filename matches any cell value against photo names', () => {
    const nameRows = [makeRow(0, { Name: 'asha' }), makeRow(1, { Name: 'Ravi' })];
    const result = matchPhotos(nameRows, photos, { mode: 'filename' });
    expect(result.assignments.get(0)?.id).toBe('p1');
    expect(result.assignments.get(1)?.id).toBe('p2');
  });

  it('mode filename does not reuse a photo for two rows', () => {
    const dupRows = [makeRow(0, { Name: 'asha' }), makeRow(1, { Name: 'asha.jpg' })];
    const result = matchPhotos(dupRows, photos, { mode: 'filename' });
    expect(result.assignments.has(0)).toBe(true);
    expect(result.assignments.has(1)).toBe(false);
  });

  it('mode manual respects explicit assignments and ignores unknown ids', () => {
    const result = matchPhotos(rows, photos, {
      mode: 'manual',
      manualAssignments: { 0: 'p3', 1: 'missing-id' },
    });
    expect(result.assignments.get(0)?.id).toBe('p3');
    expect(result.assignments.has(1)).toBe(false);
    expect(result.unmatchedRowIndexes).toEqual([1, 2]);
  });

  it('handles empty inputs', () => {
    const result = matchPhotos([], [], { mode: 'filename' });
    expect(result.assignments.size).toBe(0);
    expect(result.unmatchedRowIndexes).toEqual([]);
    expect(result.unusedPhotoNames).toEqual([]);
  });

  it('mode column fuzzy-matches names with spaces vs underscores', () => {
    // Excel says "Ravi Verma", photo file is "ravi_verma.jpg".
    const spacedPhotos = [makePhoto('p1', 'ravi_verma.jpg')];
    const rows2 = [makeRow(0, { PhotoFile: 'Ravi Verma' })];
    const result = matchPhotos(rows2, spacedPhotos, { mode: 'column', columnName: 'PhotoFile' });
    expect(result.assignments.get(0)?.id).toBe('p1');
  });

  it('mode filename fuzzy-matches photo named after the person (no column)', () => {
    // Photo named after card holder: "Asha Kumar.jpg" vs row value "Asha  Kumar".
    const peoplePhotos = [makePhoto('p1', 'Asha Kumar.jpg')];
    const rows2 = [makeRow(0, { Name: 'Asha  Kumar' })];
    const result = matchPhotos(rows2, peoplePhotos, { mode: 'filename' });
    expect(result.assignments.get(0)?.id).toBe('p1');
  });

  it('manual mode clears assignments with empty photo id', () => {
    const result = matchPhotos(rows, photos, {
      mode: 'manual',
      manualAssignments: { 0: '' },
    });
    expect(result.assignments.has(0)).toBe(false);
  });
});

describe('photoService — processPhoto', () => {
  it('rejects photos with unreadable dimensions', async () => {
    const broken = makePhoto('b1', 'broken.jpg', { width: 0, height: 0 });
    await expect(processPhoto(broken, 100, 100)).rejects.toThrow('unreadable image');
  });
});
