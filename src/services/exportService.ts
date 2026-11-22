/**
 * Native export pipeline (v0.7.5).
 *
 * Every file the app produces (batch ZIP/PDFs, the missing-photo CSV, the
 * diagnostics archive) goes through `saveExport`:
 *
 * - desktop build: a native Windows "Save as" dialog (the folder is
 *   remembered between exports, so a job folder can be reused), then the
 *   bytes are written to exactly that path — granted per-file in Rust, so the
 *   webview never gets blanket filesystem access;
 * - browser build (Vite dev server): the previous anchor download, so `npm
 *   run dev` keeps working without the Tauri runtime.
 *
 * The recent-export list is what makes "where did my PDFs go?" answerable: the
 * last 12 exports are remembered locally with their absolute path, and any of
 * them can be revealed in Explorer.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { logMessage } from './appLog';

/** What produced an export */
export type ExportKind = 'export' | 'csv' | 'diagnostics';

/** How an export ended */
export type ExportStatus = 'saved' | 'downloaded' | 'cancelled' | 'failed';

/** One remembered export (persisted locally, never uploaded) */
export interface ExportRecord {
  id: string;
  fileName: string;
  /** Absolute path on disk; null in the browser build (Downloads folder) */
  path: string | null;
  bytes: number;
  /** ISO timestamp of when the file was written */
  savedAt: string;
  kind: ExportKind;
  status: ExportStatus;
  error?: string;
}

/** Result of one save attempt */
export interface SaveExportResult {
  status: ExportStatus;
  path: string | null;
  fileName: string;
  error?: string;
}

const RECENT_KEY = 'id-stack-recent-exports';
const LAST_DIRECTORY_KEY = 'id-stack-last-export-directory';
const MAX_RECENT_EXPORTS = 12;

/** File-dialog filter for one extension */
const DIALOG_FILTERS: Record<string, { name: string; extensions: string[] }> = {
  pdf: { name: 'PDF document', extensions: ['pdf'] },
  zip: { name: 'ZIP archive', extensions: ['zip'] },
  jpg: { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
  jpeg: { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
  csv: { name: 'CSV spreadsheet', extensions: ['csv'] },
  txt: { name: 'Text file', extensions: ['txt'] },
};

/** Stable snapshot for `useSyncExternalStore` */
let recentCache: ExportRecord[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function readRecent(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ExportRecord =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as ExportRecord).fileName === 'string' &&
        typeof (entry as ExportRecord).savedAt === 'string'
    );
  } catch {
    return [];
  }
}

function persistRecent(records: ExportRecord[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(records));
  } catch {
    // A full/blocked localStorage must never fail an export.
  }
}

/** Remember one export (newest first, capped) and refresh subscribers */
function remember(record: ExportRecord): void {
  const next = [
    record,
    ...getRecentExports().filter(
      (entry) => entry.path !== record.path || entry.fileName !== record.fileName
    ),
  ].slice(0, MAX_RECENT_EXPORTS);
  recentCache = next;
  persistRecent(next);
  notify();
}

/** Recent exports, newest first */
export function getRecentExports(): ExportRecord[] {
  if (!recentCache) recentCache = readRecent();
  return recentCache;
}

/** Subscribe to recent-export changes (for `useSyncExternalStore`) */
export function subscribeRecentExports(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forget the recent-export list (files on disk are untouched) */
export function clearRecentExports(): void {
  recentCache = [];
  persistRecent([]);
  notify();
}

/** Folder of the last successful save, or null */
export function getLastExportDirectory(): string | null {
  try {
    return localStorage.getItem(LAST_DIRECTORY_KEY);
  } catch {
    return null;
  }
}

function rememberDirectory(path: string): void {
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (separatorIndex <= 0) return;
  const directory = path.slice(0, separatorIndex);
  try {
    localStorage.setItem(LAST_DIRECTORY_KEY, directory);
  } catch {
    // Not remembering the folder is harmless.
  }
}

/** Default dialog path: the remembered folder + the file name */
function defaultPathFor(fileName: string): string {
  const directory = getLastExportDirectory();
  if (!directory) return fileName;
  const separator = directory.includes('\\') ? '\\' : '/';
  return `${directory}${directory.endsWith(separator) ? '' : separator}${fileName}`;
}

/** Dialog filters for a file name's extension */
function filtersFor(fileName: string): { name: string; extensions: string[] }[] {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const filter = DIALOG_FILTERS[extension];
  if (filter) return [filter];
  return [{ name: 'File', extensions: extension ? [extension] : ['*'] }];
}

/**
 * File name at the end of a Windows/POSIX path.
 * The save dialog may return a renamed target, so the export record must use
 * what was actually written, not the suggested name (v0.7.6 fix: recent
 * exports showed "sheet_print" even when the user saved "Class 5").
 *
 * @param path - Absolute path chosen in the dialog
 * @returns Base name of the file
 */
export function baseNameOf(path: string): string {
  const separator = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return separator >= 0 ? path.slice(separator + 1) : path;
}

/** Browser fallback: the historical anchor download to the Downloads folder */
function downloadInBrowser(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke later so the download has time to start.
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Save a blob through the native dialog (desktop) or a browser download.
 *
 * @param blob - File contents
 * @param fileName - Suggested file name
 * @param kind - What produced the file (recorded in the recent list)
 * @returns What happened (saving, downloading, cancelled or failed)
 */
export async function saveExport(
  blob: Blob,
  fileName: string,
  kind: ExportKind = 'export'
): Promise<SaveExportResult> {
  if (!isTauri()) {
    downloadInBrowser(blob, fileName);
    remember({
      id: `${Date.now()}-${fileName}`,
      fileName,
      path: null,
      bytes: blob.size,
      savedAt: new Date().toISOString(),
      kind,
      status: 'downloaded',
    });
    return { status: 'downloaded', path: null, fileName };
  }

  try {
    const target = await save({
      title: 'Save export',
      defaultPath: defaultPathFor(fileName),
      filters: filtersFor(fileName),
    });

    if (!target) {
      return { status: 'cancelled', path: null, fileName };
    }

    // The fs scope is empty by default; grant exactly the chosen path.
    await invoke('allow_export_path', { path: target });
    await writeFile(target, new Uint8Array(await blob.arrayBuffer()));

    const savedName = baseNameOf(target);
    rememberDirectory(target);
    remember({
      id: `${Date.now()}-${target}`,
      fileName: savedName,
      path: target,
      bytes: blob.size,
      savedAt: new Date().toISOString(),
      kind,
      status: 'saved',
    });
    logMessage('info', `Saved export ${savedName} (${blob.size} bytes)`);
    return { status: 'saved', path: target, fileName: savedName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage('error', `Export failed (${fileName}): ${message}`);
    remember({
      id: `${Date.now()}-${fileName}-failed`,
      fileName,
      path: null,
      bytes: blob.size,
      savedAt: new Date().toISOString(),
      kind,
      status: 'failed',
      error: message,
    });
    return { status: 'failed', path: null, fileName, error: message };
  }
}

/**
 * Reveal a file (or open a folder) in Windows Explorer.
 * @returns true when Explorer was asked to show it
 */
export async function revealExportPath(path: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke('reveal_path', { path });
    return true;
  } catch (error) {
    logMessage('warn', `Could not reveal ${path}: ${String(error)}`);
    return false;
  }
}

/** Human-readable byte size (e.g. `12.4 MB`) */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const rounded =
    value >= 10 || exponent === 0
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[exponent]}`;
}
