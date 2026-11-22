/**
 * Data import type definitions (Architecture.md — data.ts).
 * Covers Excel data, photo records and column mappings used by
 * the data import pipeline and batch generation (Phase 4).
 */

/** Parsed Excel workbook content */
export interface ExcelData {
  /** Column header names (first row) */
  columns: string[];
  /** Data rows below the header */
  rows: DataRow[];
  /** Original file name for display */
  fileName: string;
}

/**
 * One importable data source: a single sheet of a workbook (v0.7.6).
 * A multi-sheet workbook produces one source per non-empty sheet, and each
 * source is generated separately (one PDF per source inside one ZIP).
 */
export interface ExcelSource {
  /** Stable id (source-scoped row identity) */
  id: string;
  /** Workbook/CSV file name */
  fileName: string;
  /** Sheet name inside the workbook */
  sheetName: string;
  /** Display label: "class5.xlsx" or "class5.xlsx › Sheet2" */
  label: string;
  /** Output base name: file stem for a one-sheet file, sheet name otherwise */
  baseName: string;
  columns: string[];
  rows: DataRow[];
  /** Normalised, order-independent column signature (mismatch gate) */
  signature: string;
  /** Set when the source cannot be processed (columns differ, unreadable) */
  error?: string;
}

/** One row of Excel data */
export interface DataRow {
  /** 0-based index in the source file (excluding header) */
  rowIndex: number;
  /** Column name → cell value */
  values: Record<string, string>;
  /** Owning source id (multi-file / multi-sheet imports) */
  sourceId?: string;
  /** Globally unique row identity (`<sourceId>::<rowIndex>`) */
  uid?: string;
}

/** Resolve a row's globally unique identity (falls back to rowIndex) */
export function rowKey(row: DataRow): number | string {
  return row.uid ?? row.rowIndex;
}

/** A photo loaded for auto-matching with data rows */
export interface PhotoRecord {
  id: string;
  fileName: string;
  /** File name without extension, lowercased — used for matching */
  baseName: string;
  /** Object URL for display (revoke when done) */
  blobUrl: string;
  /** Raw file for processing/exports */
  file: File;
  width: number;
  height: number;
  /** Photo library the record belongs to (ZIP folder / loose images) */
  libraryId?: string;
}

/**
 * A group of photos imported together: loose image files or one ZIP archive.
 * Libraries are mapped to data sources so two classes may both contain a
 * photo named "ravi.jpg" without colliding.
 */
export interface PhotoLibrary {
  id: string;
  kind: 'images' | 'zip';
  /** Display name: "photos.zip" or "Loose images" */
  name: string;
  photos: PhotoRecord[];
  /** Files inside a ZIP that were ignored (with the reason) */
  skipped?: { name: string; reason: string }[];
  /** Non-fatal problems (duplicate names, unreadable images) */
  warnings?: string[];
}

/** Mapping between a template placeholder column and an Excel column */
export interface ColumnMapping {
  /** Placeholder column name used in the template (e.g. "Name") */
  placeholder: string;
  /** Excel column header that feeds it */
  column: string;
}

/** Photo matching strategy */
export type PhotoMatchMode = 'filename' | 'column' | 'manual';

/** Configuration for how photos are matched to rows */
export interface PhotoMatchConfig {
  mode: PhotoMatchMode;
  /** Excel column containing photo file names (mode === 'column') */
  columnName?: string;
  /** Manual assignments: row key (`<sourceId>::<rowIndex>`) → photo id */
  manualAssignments?: Record<string, string>;
}

/** Result of matching photos to rows */
export interface PhotoMatchResult {
  /**
   * Row identity → photo record. Legacy single-source rows use their numeric
   * rowIndex; multi-source rows use their globally unique `uid`.
   */
  assignments: Map<number | string, PhotoRecord>;
  /** Row indexes with no matched photo */
  unmatchedRowIndexes: number[];
  /** Photo file names that matched no row */
  unusedPhotoNames: string[];
}

/** Severity levels for validation issues */
export type ValidationSeverity = 'error' | 'warning';

/** A single validation issue */
export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Issue type code */
  code: 'missing-required' | 'duplicate-id' | 'missing-photo' | 'empty-row' | 'unmapped-column';
  /** Human-readable message (already translated or raw detail) */
  message: string;
  /** Row index the issue relates to (when applicable) */
  rowIndex?: number;
  /** Column name the issue relates to (when applicable) */
  columnName?: string;
}

/** Result of validating imported data against mappings */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Rows that pass validation (may exclude invalid rows when requested) */
  validRowIndexes: number[];
}

/** Progress payload during batch generation */
export interface BatchProgress {
  currentCard: number;
  totalCards: number;
  /** 0-100 */
  percent: number;
  /** Estimated seconds remaining */
  etaSeconds: number;
  message?: string;
}
