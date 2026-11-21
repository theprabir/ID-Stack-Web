/**
 * Diagnostics bundle (v0.7.5).
 *
 * Collects everything a maintainer needs to diagnose a report — the rotating
 * app log, the environment (app version, WebView2/Edge version from the user
 * agent, OS, screen) and a settings snapshot (imposition settings, uploaded
 * font names, recent exports) — into one ZIP.
 *
 * Privacy: this is assembled on the device and written only where the user
 * chooses in the native save dialog. There is no telemetry, no upload and no
 * network request anywhere in this module.
 */
import JSZip from 'jszip';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { APP_VERSION } from '@/constants/app';
import { getRecentExports } from './exportService';
import { listFontRecords, listIndexedDBKeys, loadFromIndexedDB } from './storageService';
import { logMessage } from './appLog';

/** One log file read from the app log folder */
interface LogFileEntry {
  name: string;
  contents: string;
}

/** Read a JSON value from localStorage without throwing */
function readStoredJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Keep bundle file names safe on Windows */
function safeLogName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_') || 'log.txt';
}

/** Pretty-print one environment value for `system.txt` */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Absolute path of the app log folder (desktop only) */
export async function getLogDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>('log_directory');
  } catch {
    return null;
  }
}

/** Versions, OS, WebView2 and display details */
async function collectEnvironment(): Promise<Record<string, unknown>> {
  const shellVersion = isTauri() ? await getVersion().catch(() => null) : null;
  return {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    shellVersion,
    operatingSystem: navigator.platform || 'unknown',
    webviewUserAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    logicalCores: navigator.hardwareConcurrency ?? null,
    devicePixelRatio: window.devicePixelRatio,
    display: { width: window.screen.width, height: window.screen.height },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Settings snapshot. Deliberately excludes uploaded font binaries, PSD bytes
 * and Excel/photo data — only names, sizes and the app's own settings.
 */
async function collectSettings(): Promise<Record<string, unknown>> {
  const keys = await listIndexedDBKeys().catch(() => []);
  const imposition = await loadFromIndexedDB('psd-imposition-settings').catch(() => null);
  const fonts = await listFontRecords().catch(() => []);

  return {
    indexedDbKeys: keys,
    impositionSettings: imposition,
    uploadedFonts: fonts.map((font) => ({
      name: font.name,
      fileName: font.fileName,
      bytes: font.buffer.byteLength,
      addedDate: font.addedDate,
    })),
    uiPreferences: readStoredJson('id-stack-ui-preferences'),
    lastExportDirectory: localStorage.getItem('id-stack-last-export-directory'),
    recentExports: getRecentExports(),
  };
}

/** Human-readable summary placed at the top of the bundle */
function renderSystemReport(environment: Record<string, unknown>, logs: LogFileEntry[]): string {
  return [
    'ID Stack diagnostics',
    '===================',
    '',
    ...Object.entries(environment).map(([key, value]) => `${key}: ${formatValue(value)}`),
    '',
    logs.length === 0
      ? 'Log files: none found in the app log folder'
      : `Log files: ${logs.map((log) => `${log.name} (${log.contents.length} chars)`).join(', ')}`,
    '',
    'This bundle contains local logs and settings only. It is written where you',
    'choose and is never uploaded automatically.',
    '',
  ].join('\n');
}

/** File name stamp, e.g. `2026-11-21T14-05-33` */
function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Build the diagnostics ZIP.
 * @returns The archive blob and its suggested file name
 */
export async function buildDiagnosticsArchive(): Promise<{ blob: Blob; fileName: string }> {
  const logs: LogFileEntry[] = isTauri()
    ? await invoke<LogFileEntry[]>('read_log_files').catch(() => [])
    : [];

  const environment = await collectEnvironment();
  const settings = await collectSettings();

  const zip = new JSZip();
  zip.file('system.txt', renderSystemReport(environment, logs));
  zip.file('settings.json', JSON.stringify(settings, null, 2));
  logs.forEach((log) => zip.file(`logs/${safeLogName(log.name)}`, log.contents));

  const blob = await zip.generateAsync({ type: 'blob' });
  logMessage('info', `Built diagnostics bundle with ${logs.length} log file(s)`);
  return { blob, fileName: `id-stack-diagnostics-${timestampForFileName()}.zip` };
}
