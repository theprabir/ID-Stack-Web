import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile, collectTemplatePlaceholders, validateData } from '@/services/excelService';
import { matchPhotos, photoBaseName } from '@/services/photoService';
import { renderSidePreview } from '@/services/previewService';
import type { CardTemplate, CanvasElement } from '@/types/template';
import type { PhotoRecord, ColumnMapping } from '@/types/data';

/**
 * Integration test: Excel file → parse → placeholder collection →
 * auto-mapping → photo matching → validation → live preview render.
 * Mirrors the DataImportPage pipeline end to end (Phase 3 scope).
 */

function makeElement(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    name: id,
    type: 'text',
    x: 2,
    y: 2,
    width: 40,
    height: 8,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    fill: { type: 'solid', color: '#111111' },
    ...overrides,
  };
}

function makeTemplate(): CardTemplate {
  const front = {
    sideType: 'front' as const,
    canvasWidth: 85.6,
    canvasHeight: 54,
    backgroundColor: '#FFFFFF',
    elements: [
      makeElement('photo', { type: 'placeholder', columnName: 'Photo' }),
      makeElement('name', { type: 'placeholder', columnName: 'Name' }),
      makeElement('idline', { type: 'text', text: 'ID: {{ID}}' }),
    ],
  };
  return {
    id: 'tpl-1',
    name: 'Employee Card',
    version: '1.0',
    createdDate: '2026-01-01',
    modifiedDate: '2026-01-01',
    frontSide: front,
    backSide: { ...front, sideType: 'back' as const, elements: [] },
    metadata: {},
  };
}

function makePhoto(id: string, fileName: string): PhotoRecord {
  return {
    id,
    fileName,
    baseName: photoBaseName(fileName),
    blobUrl: `blob:${id}`,
    file: new File([], fileName),
    width: 300,
    height: 400,
  };
}

describe('integration: Excel → mapping → photos → validation → preview', () => {
  let excelRows: { rowIndex: number; values: Record<string, string> }[];
  let columns: string[];
  let mappings: ColumnMapping[];
  let photos: PhotoRecord[];

  beforeEach(async () => {
    // 1. User imports an Excel file.
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'ID', 'Department', 'Photo'],
      ['Asha Kumar', 'E001', 'Sales', 'asha.jpg'],
      ['Ravi Verma', 'E002', 'IT', 'ravi.jpg'],
      ['Mina Das', 'E001', 'HR', 'mina.jpg'], // duplicate ID + photo not loaded
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buffer], 'employees.xlsx');
    const excelData = await parseExcelFile(file);
    columns = excelData.columns;
    excelRows = excelData.rows;

    // 2. Template placeholders are collected.
    const template = makeTemplate();
    const placeholders = collectTemplatePlaceholders(template);
    expect(placeholders).toEqual(['Photo', 'Name', 'ID']);

    // 3. Auto-mapping: placeholder names equal column names.
    mappings = placeholders.map((placeholder) => ({
      placeholder,
      column: columns.find((column) => column.toLowerCase() === placeholder.toLowerCase()) ?? '',
    }));
    expect(mappings.every((mapping) => mapping.column.length > 0)).toBe(true);

    // 4. Photos are matched by column value.
    photos = [makePhoto('p1', 'asha.jpg'), makePhoto('p2', 'ravi.jpg')];
  });

  it('flows data through mapping, matching, validation and preview', async () => {
    const matchResult = matchPhotos(excelRows, photos, { mode: 'column', columnName: 'Photo' });
    expect(matchResult.assignments.size).toBe(2);
    expect(matchResult.unmatchedRowIndexes).toEqual([2]);
    expect(matchResult.unusedPhotoNames).toEqual([]);

    // 5. Validation catches the duplicate ID and the missing photo.
    const validation = validateData(
      { columns, rows: excelRows, fileName: 'employees.xlsx' },
      mappings,
      {
        requiredPlaceholders: ['Photo', 'Name', 'ID'],
        photoColumn: 'Photo',
        photoBaseNames: new Set(photos.map((photo) => photo.baseName)),
      }
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-id')).toBe(true);
    expect(validation.issues.some((issue) => issue.code === 'missing-photo')).toBe(true);
    // Row 2 has the duplicate ID (invalid); rows 0/1 are valid.
    expect(validation.validRowIndexes).toEqual([0, 1]);

    // 6. Live preview renders the first row with data applied.
    const template = makeTemplate();
    const canvas = await renderSidePreview(
      template,
      'front',
      excelRows[0] ?? { rowIndex: 0, values: {} },
      Object.fromEntries(mappings.map((mapping) => [mapping.placeholder, mapping.column])),
      { getPhoto: (rowIndex) => matchResult.assignments.get(rowIndex) }
    );
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBeGreaterThan(0);
  });
});
