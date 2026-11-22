import * as XLSX from 'xlsx';
import type {
  ExcelData,
  ExcelSource,
  DataRow,
  ValidationResult,
  ValidationIssue,
  ColumnMapping,
} from '@/types/data';
import { generateId } from '@/utils/id';

/** Supported input formats */
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/**
 * Check whether a file has a supported spreadsheet extension.
 * @param file - File chosen by the user
 * @returns True when .xlsx / .xls / .csv
 */
export function isSupportedSpreadsheet(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

/**
 * Convert a cell value to a normalised string (numbers lose trailing zeros).
 * @param value - Raw SheetJS cell value
 * @returns String value ('' for null/undefined)
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Parse an Excel or CSV file into structured data using SheetJS.
 * The first sheet is used; its first row is treated as the header.
 *
 * @param file - .xlsx, .xls or .csv file
 * @returns Parsed columns and rows
 * @throws Error for unsupported extensions or unreadable/empty sheets
 */
export async function parseExcelFile(file: File): Promise<ExcelData> {
  if (!isSupportedSpreadsheet(file)) {
    throw new Error(
      `Unsupported file type "${file.name}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (error) {
    throw new Error(
      `Could not read spreadsheet "${file.name}": ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The workbook contains no sheets.');
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('The first sheet could not be read.');
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  });

  const { columns, rows } = readMatrix(matrix);
  return { columns, rows, fileName: file.name };
}

/**
 * Get the column names from parsed data.
 * @param data - Parsed Excel data
 * @returns Column names in file order
 */
export function getColumnNames(data: ExcelData): string[] {
  return data.columns;
}

/**
 * Order-independent column signature used to compare data sources.
 * Headers are trimmed, lowercased and sorted, so the same columns in a
 * different order (or different case) still compare equal — mappings are by
 * name, not by position.
 *
 * @param columns - Column headers
 * @returns Stable signature string
 */
export function columnSignature(columns: string[]): string {
  return columns
    .map((column) => column.trim().toLowerCase())
    .filter((column) => column.length > 0)
    .sort()
    .join('|');
}

/**
 * Rename a source's columns to the reference source's spelling when the
 * signatures match (v0.7.6). Mapping is shared across the run, so a file whose
 * headers differ only in case (`NAME` vs `Name`) must use the canonical names
 * or its fields would silently render blank.
 *
 * @param source - Newly parsed source
 * @param reference - Source that defines the canonical column names
 * @returns The source, with columns/rows renamed when needed
 */
export function alignSourceColumns(source: ExcelSource, reference: ExcelSource): ExcelSource {
  const canonical = new Map(
    reference.columns.map((column) => [column.trim().toLowerCase(), column] as const)
  );
  const renames = new Map<string, string>();
  for (const column of source.columns) {
    const match = canonical.get(column.trim().toLowerCase());
    if (match !== undefined && match !== column) renames.set(column, match);
  }
  if (renames.size === 0) return source;

  const rows = source.rows.map((row) => {
    const values: Record<string, string> = {};
    for (const [column, value] of Object.entries(row.values)) {
      values[renames.get(column) ?? column] = value;
    }
    return { ...row, values };
  });
  return {
    ...source,
    columns: source.columns.map((column) => renames.get(column) ?? column),
    rows,
  };
}

/** Read a header row and data rows out of a sheet matrix */
function readMatrix(matrix: unknown[][]): { columns: string[]; rows: DataRow[] } {
  if (matrix.length < 2) {
    throw new Error('The spreadsheet needs a header row and at least one data row.');
  }

  const headerRow = matrix[0] ?? [];
  const columns = headerRow.map((cell, index) => {
    const name = cellToString(cell).trim();
    return name.length > 0 ? name : `Column ${index + 1}`;
  });

  // Drop duplicate column names by suffixing them (Excel data with dupes is common).
  const seen = new Map<string, number>();
  const uniqueColumns = columns.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });

  const rows: DataRow[] = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const raw = matrix[rowIndex] ?? [];
    const values: Record<string, string> = {};
    let hasContent = false;
    uniqueColumns.forEach((columnName, columnIndex) => {
      const value = cellToString(raw[columnIndex]).trim();
      values[columnName] = value;
      if (value.length > 0) hasContent = true;
    });
    if (hasContent) {
      rows.push({ rowIndex: rowIndex - 1, values });
    }
  }

  return { columns: uniqueColumns, rows };
}

/**
 * Parse every non-empty sheet of a workbook (or the single CSV table) into
 * independent data sources (v0.7.6).
 *
 * A multi-sheet workbook produces one source per sheet so each class can be
 * generated into its own PDF; a one-sheet file keeps the file name as its
 * output base name.
 *
 * @param file - .xlsx, .xls or .csv file
 * @returns One source per usable sheet (never empty)
 * @throws Error when the file is unsupported or has no usable sheet
 */
export async function parseExcelSources(file: File): Promise<ExcelSource[]> {
  if (!isSupportedSpreadsheet(file)) {
    throw new Error(
      `Unsupported file type "${file.name}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (error) {
    throw new Error(
      `Could not read spreadsheet "${file.name}": ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const parsed: Array<{ sheetName: string; columns: string[]; rows: DataRow[] }> = [];
  const readErrors: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    });
    try {
      const { columns, rows } = readMatrix(matrix);
      if (rows.length > 0) parsed.push({ sheetName, columns, rows });
    } catch (error) {
      // Empty sheets are normal in real workbooks; keep them out of the
      // source list but remember why if no sheet turns out usable.
      readErrors.push(`${sheetName}: ${error instanceof Error ? error.message : 'unreadable'}`);
    }
  }

  if (parsed.length === 0) {
    throw new Error(
      `"${file.name}" has no sheet with a header row and at least one data row.${readErrors.length > 0 ? ` (${readErrors[0]})` : ''}`
    );
  }

  const singleSheet = parsed.length === 1;
  const fileStem = file.name.replace(/\.[^.]+$/, '').trim() || file.name;

  return parsed.map(({ sheetName, columns, rows }) => {
    const id = generateId();
    const scopedRows: DataRow[] = rows.map((row) => ({
      ...row,
      sourceId: id,
      uid: `${id}::${row.rowIndex}`,
    }));
    return {
      id,
      fileName: file.name,
      sheetName,
      label: singleSheet ? file.name : `${file.name} › ${sheetName}`,
      baseName: singleSheet ? fileStem : sheetName,
      columns,
      rows: scopedRows,
      // A stray blank column left by formatting must not block an otherwise
      // identical file from joining the run.
      signature: columnSignature(
        columns.filter((column) => rows.some((row) => (row.values[column] ?? '').length > 0))
      ),
    };
  });
}

/**
 * Return the first N rows for UI preview.
 * @param data - Parsed Excel data
 * @param rowCount - Number of rows to preview
 * @returns Up to rowCount rows
 */
export function getPreview(data: ExcelData, rowCount: number): DataRow[] {
  return data.rows.slice(0, Math.max(0, rowCount));
}

/**
 * Serialise rows to a UTF-8 CSV string.
 *
 * A BOM is prefixed so Excel opens non-Latin scripts (Odia, Hindi, …)
 * correctly, and cells containing commas/quotes/newlines are RFC-4180
 * quoted. Used by the missing-photo list download (v0.7.2).
 *
 * @param columns - Column headers in file order (header row)
 * @param rows - Data rows to serialise
 * @returns BOM-prefixed CRLF CSV string
 */
export function toCsv(columns: string[], rows: DataRow[]): string {
  const escapeCell = (value: string | undefined): string => {
    const text = value ?? '';
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row.values[column])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

/** Options for data validation */
export interface ValidateOptions {
  /** Treat these placeholders as mandatory (e.g. mapped photo column) */
  requiredPlaceholders?: string[];
  /** Photo file names loaded for matching (checks missing-photo) */
  photoBaseNames?: Set<string>;
  /** Excel column that holds photo file names for matching */
  photoColumn?: string;
}

/**
 * Validate parsed data against column mappings.
 * Checks: missing required values, duplicate IDs, missing photos,
 * empty rows and unmapped placeholders.
 *
 * @param data - Parsed Excel data
 * @param mappings - Placeholder → column mapping list
 * @param options - Optional validation options
 * @returns Validation result with per-issue details
 */
export function validateData(
  data: ExcelData,
  mappings: ColumnMapping[],
  options: ValidateOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const validRowIndexes: number[] = [];
  const mappingByPlaceholder = new Map(
    mappings.map((mapping) => [mapping.placeholder, mapping.column])
  );

  // Warn about placeholders with no mapping.
  for (const mapping of mappings) {
    if (!mapping.column) {
      issues.push({
        severity: 'warning',
        code: 'unmapped-column',
        message: `Placeholder "{{${mapping.placeholder}}}" is not mapped to an Excel column.`,
        columnName: mapping.placeholder,
      });
    }
  }

  // Duplicate ID detection on the mapped "ID" column (or any column named like an id).
  const idColumn =
    mappingByPlaceholder.get('ID') ?? data.columns.find((column) => /^id$/i.test(column)) ?? null;

  const idSeen = new Map<string, number>();
  for (const row of data.rows) {
    let rowValid = true;

    if (idColumn) {
      const id = row.values[idColumn] ?? '';
      if (id.length > 0) {
        const previousRow = idSeen.get(id);
        if (previousRow !== undefined) {
          issues.push({
            severity: 'error',
            code: 'duplicate-id',
            message: `Duplicate ID "${id}" also used in row ${previousRow + 1}.`,
            rowIndex: row.rowIndex,
            columnName: idColumn,
          });
          rowValid = false;
        } else {
          idSeen.set(id, row.rowIndex);
        }
      }
    }

    // Required placeholders must map to non-empty values.
    for (const placeholder of options.requiredPlaceholders ?? []) {
      const column = mappingByPlaceholder.get(placeholder);
      if (!column) continue; // unmapped already reported above
      const value = row.values[column] ?? '';
      if (value.length === 0) {
        issues.push({
          severity: 'error',
          code: 'missing-required',
          message: `Row ${row.rowIndex + 1}: required field "${column}" is empty.`,
          rowIndex: row.rowIndex,
          columnName: column,
        });
        rowValid = false;
      }
    }

    // Photo existence check (mode 'column').
    if (options.photoColumn && options.photoBaseNames) {
      const photoValue = row.values[options.photoColumn] ?? '';
      if (photoValue.length > 0) {
        const base = photoValue.replace(/\.[^.]+$/, '').toLowerCase();
        if (!options.photoBaseNames.has(base)) {
          issues.push({
            severity: 'warning',
            code: 'missing-photo',
            message: `Row ${row.rowIndex + 1}: no photo found for "${photoValue}".`,
            rowIndex: row.rowIndex,
            columnName: options.photoColumn,
          });
        }
      }
    }

    // Fully empty rows are skipped upstream, but flag rows with an ID and nothing else.
    const nonEmpty = Object.values(row.values).filter((value) => value.length > 0).length;
    if (nonEmpty === 1 && idColumn && (row.values[idColumn] ?? '').length > 0) {
      issues.push({
        severity: 'warning',
        code: 'empty-row',
        message: `Row ${row.rowIndex + 1} contains only an ID and no other data.`,
        rowIndex: row.rowIndex,
      });
    }

    if (rowValid) validRowIndexes.push(row.rowIndex);
  }

  return { valid: issues.every((issue) => issue.severity !== 'error'), issues, validRowIndexes };
}
