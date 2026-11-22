import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

/**
 * v0.7.6 multi-source batch regressions:
 * - the renderer must resolve a photo by the source-scoped row key, not by
 *   the numeric row index (otherwise every photo in a multi-source run is lost);
 * - cards mode must place each source in its own folder, with duplicate source
 *   names kept apart.
 */

const recorded = vi.hoisted(() => ({ photos: [] as unknown[] }));

vi.mock('@/services/psdCompositeService', () => ({
  compositeDesign: async (
    _design: unknown,
    options: { getPhoto: () => unknown }
  ): Promise<{ width: number; height: number }> => {
    recorded.photos.push(options.getPhoto());
    return { width: 10, height: 10 };
  },
}));

vi.mock('@/services/cmykExportService', () => ({
  encodeCmykJpeg: async (): Promise<Uint8Array> => new Uint8Array([1, 2, 3]),
  encodeCmykPdf: async (): Promise<Uint8Array> => new Uint8Array([1]),
  encodeCmykPdfDoubleSided: async (): Promise<Uint8Array> => new Uint8Array([1]),
}));

import {
  runBatchSources,
  type BatchOptions,
  type BatchSource,
} from '@/services/batchService';
import { DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';
import type { PsdProject } from '@/types/psd';
import type { PhotoRecord } from '@/types/data';

function makeProject(): PsdProject {
  return {
    front: {
      width: 650,
      height: 1028,
      horizontalResolution: 300,
      placeholders: [],
    },
    back: null,
    placeholders: [],
  } as unknown as PsdProject;
}

function makePhoto(id: string): PhotoRecord {
  return {
    id,
    fileName: `${id}.jpg`,
    baseName: id,
    blobUrl: `blob:${id}`,
    file: new File([], `${id}.jpg`),
    width: 300,
    height: 400,
  };
}

function makeSource(
  id: string,
  baseName: string,
  photo: PhotoRecord
): BatchSource {
  return {
    id,
    label: baseName,
    baseName,
    data: {
      columns: ['Name'],
      fileName: baseName,
      rows: [{ rowIndex: 0, values: { Name: 'Asha' }, sourceId: id, uid: `${id}::0` }],
    },
    photoMatches: {
      assignments: new Map([[`${id}::0`, photo]]),
      unmatchedRowIndexes: [],
      unusedPhotoNames: [],
    },
  };
}

function makeOptions(): BatchOptions {
  return {
    format: 'jpg',
    quality: 0.92,
    naming: '{Row}',
    sides: 'front',
    outputMode: 'cards',
    imposition: DEFAULT_IMPOSITION_SETTINGS,
  };
}

describe('v0.7.6 — runBatchSources', () => {
  it('finds the photo through the source-scoped row key', async () => {
    recorded.photos.length = 0;
    const photo = makePhoto('asha');
    let output: { blob: Blob; fileName: string } | null = null;

    await runBatchSources(
      makeProject(),
      [makeSource('s1', 'Class 5', photo)],
      {},
      makeOptions(),
      () => 'running',
      { onProgress: () => undefined, onComplete: (result) => { output = result; } }
    );

    expect(output).not.toBeNull();
    expect(recorded.photos[0]).toBe(photo);
  });

  it('puts each source in its own folder and keeps duplicate names apart', async () => {
    recorded.photos.length = 0;
    let output: { blob: Blob; fileName: string } | null = null;

    await runBatchSources(
      makeProject(),
      [
        makeSource('s1', 'Class 5', makePhoto('asha')),
        makeSource('s2', 'Class 5', makePhoto('ravi')),
      ],
      {},
      makeOptions(),
      () => 'running',
      { onProgress: () => undefined, onComplete: (result) => { output = result; } }
    );

    expect(output).not.toBeNull();
    const zip = await JSZip.loadAsync(await (output as unknown as { blob: Blob }).blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
    expect(names).toContain('Class 5/001.jpg');
    expect(names).toContain('Class 5 (2)/001.jpg');
  });

  it('keeps a single source at the archive root (no needless folder)', async () => {
    recorded.photos.length = 0;
    let output: { blob: Blob; fileName: string } | null = null;

    await runBatchSources(
      makeProject(),
      [makeSource('s1', 'Class 5', makePhoto('asha'))],
      {},
      makeOptions(),
      () => 'running',
      { onProgress: () => undefined, onComplete: (result) => { output = result; } }
    );

    const zip = await JSZip.loadAsync(await (output as unknown as { blob: Blob }).blob.arrayBuffer());
    expect(Object.keys(zip.files)).toContain('001.jpg');
  });
});
