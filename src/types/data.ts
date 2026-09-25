/**
 * Data import type definitions (Architecture.md — data.ts).
 * Covers Excel data, photo records and column mappings used by
 * the data import pipeline and batch generation (Phase 4).
 */
import type { CardTemplate } from './template';

/** Parsed Excel workbook content */
export interface ExcelData {
  /** Column header names (first row) */
  columns: string[];
  /** Data rows below the header */
  rows: DataRow[];
  /** Original file name for display */
  fileName: string;
}

/** One row of Excel data */
export interface DataRow {
  /** 0-based index in the source file (excluding header) */
  rowIndex: number;
  /** Column name → cell value */
  values: Record<string, string>;
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
  /** Manual assignments: rowIndex → photo id */
  manualAssignments?: Record<number, string>;
}

/** Result of matching photos to rows */
export interface PhotoMatchResult {
  /** rowIndex → photo record */
  assignments: Map<number, PhotoRecord>;
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

/** Request payload for batch generation (consumed in Phase 4) */
export interface BatchRequest {
  template: CardTemplate;
  data: ExcelData;
  mappings: Map<string, string>;
  photoMatches: PhotoMatchResult;
  /** Output format for individual cards */
  format: 'png' | 'jpg' | 'pdf';
  /** JPEG quality 0-1 when format === 'jpg' */
  quality?: number;
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
