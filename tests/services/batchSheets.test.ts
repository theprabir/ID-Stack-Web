import { describe, it, expect, vi } from 'vitest';

/**
 * Regression test for the v0.7.4 imposed-sheet packing bug.
 *
 * Interleaved duplex sheets hold a row of fronts and the matching row of backs.
 * The writer used to be flushed after every RECORD (because the counter was
 * compared with the number of pair-rows instead of records), so a 7-record job
 * produced 7 pages with one record each — "all the id cards in different
 * pages" — instead of 3 pages of 3 records.
 */

const fake = vi.hoisted(() => ({
  writers: [] as Array<{
    pages: Array<Map<number, number | null>>;
    put: (index: number, canvas: unknown, cardNumber: number | null) => void;
  }>,
}));

vi.mock('@/services/psdCompositeService', () => ({
  compositeDesign: async () => ({ width: 650, height: 1028 }),
}));

vi.mock('@/services/impositionService', () => ({
  encodeCardForSheet: async () => ({
    bytes: new Uint8Array(8),
    width: 650,
    height: 1028,
  }),
  releaseCanvas: () => undefined,
}));

vi.mock('@/services/sheetJobWriter', () => {
  class FakeSheetJobWriter {
    pages: Array<Map<number, number | null>> = [];
    private slots = new Map<number, number | null>();

    static async create(): Promise<FakeSheetJobWriter> {
      const writer = new FakeSheetJobWriter();
      fake.writers.push(writer as unknown as (typeof fake.writers)[number]);
      return writer;
    }

    put(index: number, _canvas: unknown, cardNumber: number | null): void {
      this.slots.set(index, cardNumber);
    }

    get isFull(): boolean {
      return false;
    }

    async flushPage(): Promise<void> {
      this.pages.push(new Map(this.slots));
      this.slots.clear();
    }

    async finish(): Promise<Array<{ blob: Blob; fileName: string }>> {
      if (this.slots.size > 0) await this.flushPage();
      return [{ blob: new Blob(['pdf']), fileName: 'sheet_Print.pdf' }];
    }
  }

  return { SheetJobWriter: FakeSheetJobWriter };
});

import { runBatch, type BatchOptions } from '@/services/batchService';
import { DEFAULT_IMPOSITION_SETTINGS, computeSheetLayout, artworkSizePt } from '@/services/impositionTypes';
import type { PsdProject } from '@/types/psd';
import type { DataRow, ExcelData, PhotoMatchResult } from '@/types/data';

function makeProject(): PsdProject {
  const design = {
    width: 650,
    height: 1028,
    horizontalResolution: 300,
    placeholders: [],
  };
  return {
    front: design,
    back: design,
    placeholders: [],
  } as unknown as PsdProject;
}

function makeData(count: number): ExcelData {
  const rows: DataRow[] = Array.from({ length: count }, (_, i) => ({
    rowIndex: i,
    values: { Name: `Person ${i + 1}` },
  }));
  return { columns: ['Name'], rows, fileName: 'employees.xlsx' };
}

describe('runBatch — interleaved imposed sheets (v0.7.4)', () => {
  it('packs a full row of records per page instead of one record per page', async () => {
    const settings = { ...DEFAULT_IMPOSITION_SETTINGS };
    const card = artworkSizePt(650, 1028, 300, 'portrait');
    const layout = computeSheetLayout(settings, undefined, card);
    expect(layout).not.toBeNull();

    const options: BatchOptions = {
      format: 'pdf',
      quality: 0.92,
      naming: '{Row}',
      sides: 'both',
      outputMode: 'sheets',
      imposition: settings,
    };

    const matches: PhotoMatchResult = {
      assignments: new Map(),
      unmatchedRowIndexes: [],
      unusedPhotoNames: [],
    };

    let finished = false;
    await runBatch(
      makeProject(),
      makeData(7),
      {},
      matches,
      options,
      () => 'running',
      { onProgress: () => undefined, onComplete: () => { finished = true; } }
    );

    expect(finished).toBe(true);
    expect(fake.writers).toHaveLength(1);
    const pages = fake.writers[0]!.pages;

    // 3 columns × 2 rows → one row of fronts + one row of backs = 3 records.
    const perPage = layout!.columns;
    expect(perPage).toBeGreaterThan(1);
    expect(pages).toHaveLength(Math.ceil(7 / perPage));

    // First page: every front slot (0..columns-1) and its back directly below.
    const firstPage = pages[0]!;
    expect([...firstPage.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: perPage * 2 }, (_, i) => i)
    );

    // Last page holds only the remaining record, not a page per record.
    const remaining = 7 % perPage === 0 ? perPage : 7 % perPage;
    expect(pages[pages.length - 1]!.size).toBe(remaining * 2);
    expect(pages.length).toBeLessThan(7);
  });

  it('fills a landscape A4 sheet with its 4 × 2 grid (2 pages for 7 records)', async () => {
    const settings = {
      ...DEFAULT_IMPOSITION_SETTINGS,
      paper: { ...DEFAULT_IMPOSITION_SETTINGS.paper, landscape: true },
    };
    const options: BatchOptions = {
      format: 'pdf',
      quality: 0.92,
      naming: '{Row}',
      sides: 'both',
      outputMode: 'sheets',
      imposition: settings,
    };

    await runBatch(
      makeProject(),
      makeData(7),
      {},
      { assignments: new Map(), unmatchedRowIndexes: [], unusedPhotoNames: [] },
      options,
      () => 'running',
      { onProgress: () => undefined, onComplete: () => undefined }
    );

    const writer = fake.writers[fake.writers.length - 1]!;
    const layout = computeSheetLayout(
      settings,
      undefined,
      artworkSizePt(650, 1028, 300, 'portrait')
    )!;
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(2);
    // 4 records per sheet → 4 + 3.
    expect(writer.pages).toHaveLength(2);
    expect(writer.pages[0]!.size).toBe(8);
    expect(writer.pages[1]!.size).toBe(6);
  });

  it('numbers a record’s front and back with the same per-sheet number', async () => {
    const settings = {
      ...DEFAULT_IMPOSITION_SETTINGS,
      numbering: { ...DEFAULT_IMPOSITION_SETTINGS.numbering, mode: 'per-sheet' as const },
    };
    const options: BatchOptions = {
      format: 'pdf',
      quality: 0.92,
      naming: '{Row}',
      sides: 'both',
      outputMode: 'sheets',
      imposition: settings,
    };

    await runBatch(
      makeProject(),
      makeData(4),
      {},
      { assignments: new Map(), unmatchedRowIndexes: [], unusedPhotoNames: [] },
      options,
      () => 'running',
      { onProgress: () => undefined, onComplete: () => undefined }
    );

    const writer = fake.writers[fake.writers.length - 1]!;
    const page = writer.pages[0]!;
    const columns = computeSheetLayout(
      settings,
      undefined,
      artworkSizePt(650, 1028, 300, 'portrait')
    )!.columns;

    for (let index = 0; index < 3; index += 1) {
      const column = index % columns;
      expect(page.get(column)).toBe(index + 1);
      expect(page.get(columns + column)).toBe(index + 1);
    }
  });
});
