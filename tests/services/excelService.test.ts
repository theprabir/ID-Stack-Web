import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseExcelFile,
  getColumnNames,
  getPreview,
  collectTemplatePlaceholders,
  validateData,
  isSupportedSpreadsheet,
} from '@/services/excelService';
import type { CardTemplate, CanvasElement } from '@/types/template';
import type { ExcelData, ColumnMapping } from '@/types/data';

/** Build a File from an array-of-arrays workbook */
function makeExcelFile(rows: unknown[][], name = 'test.xlsx'): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makeCsvFile(content: string): File {
  return new File([content], 'data.csv', { type: 'text/csv' });
}

function makeElement(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    name: id,
    type: 'text',
    x: 0,
    y: 0,
    width: 20,
    height: 6,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<CardTemplate> = {}): CardTemplate {
  const emptySide = {
    sideType: 'front' as const,
    canvasWidth: 85.6,
    canvasHeight: 54,
    backgroundColor: '#FFFFFF',
    elements: [] as CanvasElement[],
  };
  return {
    id: 't1',
    name: 'Test',
    version: '1.0',
    createdDate: '2026-01-01',
    modifiedDate: '2026-01-01',
    frontSide: emptySide,
    backSide: { ...emptySide, sideType: 'back' as const },
    metadata: {},
    ...overrides,
  };
}

describe('excelService — parsing', () => {
  it('rejects unsupported file types', async () => {
    const file = new File(['x'], 'notes.txt');
    await expect(parseExcelFile(file)).rejects.toThrow('Unsupported file type');
  });

  it('isSupportedSpreadsheet accepts xlsx/xls/csv only', () => {
    expect(isSupportedSpreadsheet(new File([], 'a.xlsx'))).toBe(true);
    expect(isSupportedSpreadsheet(new File([], 'a.xls'))).toBe(true);
    expect(isSupportedSpreadsheet(new File([], 'a.csv'))).toBe(true);
    expect(isSupportedSpreadsheet(new File([], 'a.txt'))).toBe(false);
  });

  it('parses an xlsx file into columns and rows', async () => {
    const file = makeExcelFile([
      ['Name', 'ID', 'Department'],
      ['Asha', 'E001', 'Sales'],
      ['Ravi', 'E002', 'IT'],
    ]);
    const data = await parseExcelFile(file);
    expect(data.fileName).toBe('test.xlsx');
    expect(data.columns).toEqual(['Name', 'ID', 'Department']);
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]?.values).toEqual({ Name: 'Asha', ID: 'E001', Department: 'Sales' });
    expect(data.rows[1]?.values.ID).toBe('E002');
  });

  it('parses a CSV file', async () => {
    const file = makeCsvFile('Name,ID\nAsha,E001\nRavi,E002\n');
    const data = await parseExcelFile(file);
    expect(data.columns).toEqual(['Name', 'ID']);
    expect(data.rows).toHaveLength(2);
  });

  it('throws on empty sheets', async () => {
    const file = makeExcelFile([['Name']]);
    await expect(parseExcelFile(file)).rejects.toThrow('header row and at least one data row');
  });

  it('fills unnamed columns and deduplicates names', async () => {
    const file = makeExcelFile([
      ['Name', '', 'Name'],
      ['a', 'b', 'c'],
    ]);
    const data = await parseExcelFile(file);
    expect(data.columns).toEqual(['Name', 'Column 2', 'Name (2)']);
  });

  it('skips fully blank rows', async () => {
    const file = makeExcelFile([
      ['Name', 'ID'],
      ['Asha', 'E001'],
      ['', ''],
      ['Ravi', 'E002'],
    ]);
    const data = await parseExcelFile(file);
    expect(data.rows).toHaveLength(2);
    expect(data.rows.map((row) => row.values.Name)).toEqual(['Asha', 'Ravi']);
  });
});

describe('excelService — helpers', () => {
  const data: ExcelData = {
    columns: ['Name', 'ID'],
    fileName: 'a.xlsx',
    rows: [
      { rowIndex: 0, values: { Name: 'Asha', ID: 'E001' } },
      { rowIndex: 1, values: { Name: 'Ravi', ID: 'E002' } },
      { rowIndex: 2, values: { Name: 'Mina', ID: 'E003' } },
    ],
  };

  it('getColumnNames returns columns in order', () => {
    expect(getColumnNames(data)).toEqual(['Name', 'ID']);
  });

  it('getPreview returns first N rows', () => {
    expect(getPreview(data, 2)).toHaveLength(2);
    expect(getPreview(data, 0)).toHaveLength(0);
    expect(getPreview(data, 99)).toHaveLength(3);
  });
});

describe('excelService — collectTemplatePlaceholders', () => {
  it('collects placeholder element columns and {{Token}} text tokens', () => {
    const template = makeTemplate({
      frontSide: {
        sideType: 'front',
        canvasWidth: 85.6,
        canvasHeight: 54,
        backgroundColor: '#FFF',
        elements: [
          makeElement('p1', { type: 'placeholder', columnName: 'Name' }),
          makeElement('t1', { type: 'text', text: 'ID: {{ID}} — Dept: {{Department}}' }),
        ],
      },
      backSide: {
        sideType: 'back',
        canvasWidth: 85.6,
        canvasHeight: 54,
        backgroundColor: '#FFF',
        elements: [makeElement('p2', { type: 'placeholder', columnName: 'Photo' })],
      },
    });
    expect(collectTemplatePlaceholders(template)).toEqual(['Name', 'ID', 'Department', 'Photo']);
  });

  it('deduplicates repeated placeholders', () => {
    const template = makeTemplate({
      frontSide: {
        sideType: 'front',
        canvasWidth: 85.6,
        canvasHeight: 54,
        backgroundColor: '#FFF',
        elements: [
          makeElement('t1', { type: 'text', text: '{{Name}}' }),
          makeElement('t2', { type: 'text', text: '{{ Name }} again' }),
        ],
      },
    });
    expect(collectTemplatePlaceholders(template)).toEqual(['Name']);
  });
});

describe('excelService — validateData', () => {
  const data: ExcelData = {
    columns: ['Name', 'ID', 'PhotoFile'],
    fileName: 'a.xlsx',
    rows: [
      { rowIndex: 0, values: { Name: 'Asha', ID: 'E001', PhotoFile: 'asha.jpg' } },
      { rowIndex: 1, values: { Name: '', ID: 'E002', PhotoFile: 'ravi.jpg' } },
      { rowIndex: 2, values: { Name: 'Mina', ID: 'E003', PhotoFile: '' } },
    ],
  };

  const mappings: ColumnMapping[] = [
    { placeholder: 'Name', column: 'Name' },
    { placeholder: 'ID', column: 'ID' },
    { placeholder: 'Photo', column: 'PhotoFile' },
  ];

  it('flags duplicate IDs and missing required values as errors', () => {
    const dataWithDup: ExcelData = {
      ...data,
      rows: [
        data.rows[0]!,
        { rowIndex: 1, values: { Name: '', ID: 'E001', PhotoFile: 'ravi.jpg' } },
        data.rows[2]!,
      ],
    };
    const result = validateData(dataWithDup, mappings, { requiredPlaceholders: ['Name', 'ID'] });
    expect(result.valid).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('duplicate-id');
    expect(codes).toContain('missing-required');
    expect(result.validRowIndexes).toEqual([0, 2]);
  });

  it('warns on missing photo files', () => {
    const result = validateData(data, mappings, {
      photoColumn: 'PhotoFile',
      photoBaseNames: new Set(['asha', 'mina']),
    });
    const photoIssues = result.issues.filter((issue) => issue.code === 'missing-photo');
    expect(photoIssues).toHaveLength(1);
    expect(photoIssues[0]?.rowIndex).toBe(1);
    // Warnings do not make the data invalid.
    expect(result.issues.every((issue) => issue.severity !== 'error')).toBe(true);
  });

  it('warns about unmapped placeholders', () => {
    const result = validateData(data, [{ placeholder: 'Email', column: '' }]);
    expect(result.issues.some((issue) => issue.code === 'unmapped-column')).toBe(true);
  });

  it('passes clean data', () => {
    const clean: ExcelData = {
      columns: ['Name', 'ID'],
      fileName: 'a.xlsx',
      rows: [{ rowIndex: 0, values: { Name: 'Asha', ID: 'E001' } }],
    };
    const result = validateData(clean, mappings, { requiredPlaceholders: ['Name'] });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.validRowIndexes).toEqual([0]);
  });

  it('warns when a row only contains an ID', () => {
    const sparse: ExcelData = {
      columns: ['Name', 'ID'],
      fileName: 'a.xlsx',
      rows: [{ rowIndex: 0, values: { Name: '', ID: 'E001' } }],
    };
    const result = validateData(sparse, mappings);
    expect(result.issues.some((issue) => issue.code === 'empty-row')).toBe(true);
  });
});
