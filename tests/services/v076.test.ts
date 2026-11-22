import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  parseExcelSources,
  parseExcelFile,
  columnSignature,
  alignSourceColumns,
} from '@/services/excelService';
import { uniqueFileName, sanitizeSegment } from '@/services/batchNaming';
import {
  autoMapLibraries,
  extractPhotoLibrary,
  normalizeLibraryKey,
} from '@/services/photoZipService';
import { matchPhotos } from '@/services/photoService';
import type { ExcelSource, PhotoLibrary, PhotoRecord } from '@/types/data';

/** Build a workbook with the given sheets (name → rows) */
function makeWorkbook(
  sheets: Record<string, unknown[][]>,
  fileName = 'classes.xlsx'
): File {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makePhoto(id: string, fileName: string): PhotoRecord {
  return {
    id,
    fileName,
    baseName: fileName.replace(/\.[^.]+$/, '').toLowerCase(),
    blobUrl: `blob:${id}`,
    file: new File([], fileName),
    width: 300,
    height: 400,
  };
}

function makeSource(partial: Partial<ExcelSource> & Pick<ExcelSource, 'id' | 'baseName'>): ExcelSource {
  return {
    fileName: 'classes.xlsx',
    sheetName: partial.baseName,
    label: partial.baseName,
    columns: ['Name'],
    rows: [{ rowIndex: 0, values: { Name: 'Asha' }, sourceId: partial.id, uid: `${partial.id}::0` }],
    signature: columnSignature(['Name']),
    ...partial,
  };
}

describe('v0.7.6 — multi-sheet / multi-file sources', () => {
  it('parses one source per non-empty sheet with source-scoped row identity', async () => {
    const file = makeWorkbook({
      'Class 5': [
        ['Name', 'ID'],
        ['Asha', 'E1'],
      ],
      'Class 6': [
        ['Name', 'ID'],
        ['Ravi', 'E1'],
      ],
      Empty: [['Name']],
    });

    const sources = await parseExcelSources(file);
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.sheetName)).toEqual(['Class 5', 'Class 6']);
    expect(sources.map((source) => source.baseName)).toEqual(['Class 5', 'Class 6']);
    expect(sources[0]!.label).toBe('classes.xlsx › Class 5');
    // Identical column sets: the same signature allows one mapping/run.
    expect(sources[0]!.signature).toBe(sources[1]!.signature);
    // Same row index, different source identity — the collision case.
    expect(sources[0]!.rows[0]!.rowIndex).toBe(sources[1]!.rows[0]!.rowIndex);
    expect(sources[0]!.rows[0]!.uid).not.toBe(sources[1]!.rows[0]!.uid);
  });

  it('uses the file name as output base name for a one-sheet file', async () => {
    const file = makeWorkbook({ Sheet1: [['Name'], ['Asha']] }, 'Class 5.xlsx');
    const sources = await parseExcelSources(file);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.baseName).toBe('Class 5');
    expect(sources[0]!.label).toBe('Class 5.xlsx');
    // The legacy single-sheet parser still works.
    expect((await parseExcelFile(file)).rows).toHaveLength(1);
  });

  it('column signatures ignore order, case and surrounding spaces', () => {
    expect(columnSignature(['Name', 'ID', 'Photo'])).toBe(
      columnSignature([' photo ', 'name', 'id'])
    );
    expect(columnSignature(['Name', 'ID'])).not.toBe(columnSignature(['Name', 'Roll']));
  });

  it('aligns differently-cased headers to the shared mapping', () => {
    const reference = makeSource({ id: 's1', baseName: 'Class 5' });
    const source = makeSource({
      id: 's2',
      baseName: 'Class 6',
      columns: ['NAME', 'ID'],
      rows: [{ rowIndex: 0, values: { NAME: 'Ravi', ID: 'E2' }, uid: 's2::0' }],
    });
    const aligned = alignSourceColumns(source, {
      ...reference,
      columns: ['Name', 'ID'],
    });
    expect(aligned.columns).toEqual(['Name', 'ID']);
    expect(aligned.rows[0]!.values).toEqual({ Name: 'Ravi', ID: 'E2' });
  });
});

describe('v0.7.6 — collision-safe output names', () => {
  it('suffixes duplicate names instead of overwriting them', () => {
    const used = new Set<string>();
    expect(uniqueFileName(used, 'Class 5.pdf')).toBe('Class 5.pdf');
    expect(uniqueFileName(used, 'Class 5.pdf')).toBe('Class 5 (2).pdf');
    expect(uniqueFileName(used, 'Class 5.pdf')).toBe('Class 5 (3).pdf');
    // Case-insensitive on Windows.
    expect(uniqueFileName(used, 'class 5.PDF')).toBe('class 5 (4).PDF');
    expect(uniqueFileName(used, 'Class 5_part1of2.pdf')).toBe('Class 5_part1of2.pdf');
  });

  it('sanitises archive folder segments', () => {
    expect(sanitizeSegment('Class 5: A/B')).toBe('Class 5_ A_B');
    expect(sanitizeSegment('   ')).toBe('source');
  });
});

describe('v0.7.6 — photo libraries and smart mapping', () => {
  it('normalises ZIP/source names for matching', () => {
    expect(normalizeLibraryKey('Class 5 Photos.zip')).toBe('class5');
    expect(normalizeLibraryKey('class_5')).toBe('class5');
    expect(normalizeLibraryKey('CLASS-5 (1).zip')).toBe('class5');
    expect(normalizeLibraryKey('photos-class5.zip')).toBe('class5');
  });

  it('auto-maps only unambiguous exact matches, never guessing', () => {
    const libraries: PhotoLibrary[] = [
      { id: 'l1', kind: 'zip', name: 'Class 5 Photos.zip', photos: [] },
      { id: 'l2', kind: 'zip', name: 'Class 6.zip', photos: [] },
      { id: 'l3', kind: 'zip', name: 'misc.zip', photos: [] },
    ];
    const sources = [
      makeSource({ id: 's1', baseName: 'Class 5' }),
      makeSource({ id: 's2', baseName: 'Class 6' }),
      makeSource({ id: 's3', baseName: 'Class 7' }),
    ];

    expect(autoMapLibraries(sources, libraries)).toEqual({ s1: 'l1', s2: 'l2' });
  });

  it('does not give a workbook-named ZIP to just one of its sheets', () => {
    const sources = [
      makeSource({ id: 's1', baseName: 'Class 5', fileName: 'classes.xlsx' }),
      makeSource({ id: 's2', baseName: 'Class 6', fileName: 'classes.xlsx' }),
    ];
    const libraries: PhotoLibrary[] = [
      { id: 'l1', kind: 'zip', name: 'classes.zip', photos: [] },
    ];
    // Both sheets match the workbook name, so the app must not guess.
    expect(autoMapLibraries(sources, libraries)).toEqual({});
  });

  it('extracts a ZIP into its own library and skips metadata entries', async () => {
    const zip = new JSZip();
    zip.file('Class 5/asha.jpg', new Uint8Array([1, 2, 3]));
    zip.file('Class 5/ravi.png', new Uint8Array([4, 5, 6]));
    zip.file('__MACOSX/._asha.jpg', new Uint8Array([1]));
    zip.file('Class 5/notes.txt', 'ignore me');
    const archive = await zip.generateAsync({ type: 'blob' });
    const file = new File([archive], 'Class 5 Photos.zip', { type: 'application/zip' });

    const library = await extractPhotoLibrary(file);
    expect(library.kind).toBe('zip');
    expect(library.photos.map((photo) => photo.fileName).sort()).toEqual([
      'asha.jpg',
      'ravi.png',
    ]);
    expect(library.photos.every((photo) => photo.libraryId === library.id)).toBe(true);
    expect(library.skipped?.map((entry) => entry.reason)).toContain('macOS metadata');
    expect(library.skipped?.map((entry) => entry.reason)).toContain('not an image');
  });
});

describe('v0.7.6 — source-scoped photo matching', () => {
  it('keeps same-named and same-numbered rows from two classes apart', () => {
    const class5: PhotoRecord[] = [makePhoto('a', 'asha.jpg'), makePhoto('b', 'ravi.jpg')];
    const class6: PhotoRecord[] = [makePhoto('c', 'asha.jpg'), makePhoto('d', 'ravi.jpg')];

    const row5 = { rowIndex: 0, values: { Name: 'Asha' }, sourceId: 's5', uid: 's5::0' };
    const row6 = { rowIndex: 0, values: { Name: 'Asha' }, sourceId: 's6', uid: 's6::0' };

    const match5 = matchPhotos([row5], class5, {
      mode: 'manual',
      manualAssignments: { 's5::0': 'b' },
    });
    const match6 = matchPhotos([row6], class6, { mode: 'filename' });

    expect(match5.assignments.get('s5::0')?.id).toBe('b');
    expect(match6.assignments.get('s6::0')?.id).toBe('c');
    // Class 6's assignment never leaks into Class 5's row key.
    expect(match5.assignments.has('s6::0')).toBe(false);
    expect(match6.assignments.has('s5::0')).toBe(false);
  });

  it('does not reuse one photo for two rows in a library', () => {
    const photos = [makePhoto('a', 'asha.jpg')];
    const rows = [
      { rowIndex: 0, values: { Name: 'Asha' }, uid: 's::0' },
      { rowIndex: 1, values: { Name: 'Asha.jpg' }, uid: 's::1' },
    ];
    const result = matchPhotos(rows, photos, { mode: 'filename' });
    expect(result.assignments.has('s::0')).toBe(true);
    expect(result.assignments.has('s::1')).toBe(false);
  });
});
