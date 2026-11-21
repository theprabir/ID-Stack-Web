import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(() => true),
  invoke: vi.fn<(command: string) => Promise<unknown>>(async () => null),
  getVersion: vi.fn<() => Promise<string>>(async () => '0.7.5'),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.isTauri,
  invoke: mocks.invoke,
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }));
vi.mock('@/services/appLog', () => ({ logMessage: vi.fn() }));
vi.mock('@/services/exportService', () => ({ getRecentExports: () => [] }));
vi.mock('@/services/storageService', () => ({
  listIndexedDBKeys: async () => ['psd-imposition-settings'],
  loadFromIndexedDB: async () => ({ paper: 'a4' }),
  listFontRecords: async () => [
    { name: 'Arimo', fileName: 'arimo.ttf', buffer: new ArrayBuffer(4), addedDate: '2026-01-01' },
  ],
}));

import { buildDiagnosticsArchive, getLogDirectory } from '@/services/diagnosticsService';

describe('diagnosticsService', () => {
  beforeEach(() => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'log_directory') return 'C:\\Logs';
      if (command === 'read_log_files') {
        return [{ name: 'id-stack.log', contents: 'batch started' }];
      }
      return null;
    });
  });

  it('bundles the environment, settings and log files into one ZIP', async () => {
    const { blob, fileName } = await buildDiagnosticsArchive();

    expect(fileName).toMatch(/^id-stack-diagnostics-\d{4}-\d{2}-\d{2}T.*\.zip$/);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(['system.txt', 'settings.json', 'logs/id-stack.log'])
    );

    const system = await zip.file('system.txt')!.async('string');
    expect(system).toContain('appVersion: 0.7.5');
    expect(system).toContain('shellVersion: 0.7.5');
    expect(system).toContain('id-stack.log');

    const settings = JSON.parse(await zip.file('settings.json')!.async('string')) as {
      uploadedFonts: Array<Record<string, unknown>>;
      impositionSettings: unknown;
    };
    expect(settings.impositionSettings).toEqual({ paper: 'a4' });
    // Font binaries never leave the device — only their names and sizes.
    expect(settings.uploadedFonts).toEqual([
      { name: 'Arimo', fileName: 'arimo.ttf', bytes: 4, addedDate: '2026-01-01' },
    ]);

    expect(await zip.file('logs/id-stack.log')!.async('string')).toBe('batch started');
  });

  it('handles a build with no log files', async () => {
    mocks.invoke.mockImplementation(async (command: string) =>
      command === 'read_log_files' ? [] : null
    );

    const { blob } = await buildDiagnosticsArchive();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(await zip.file('system.txt')!.async('string')).toContain('Log files: none found');
    expect(zip.file('logs/id-stack.log')).toBeNull();
  });

  it('reports the log folder only in the desktop build', async () => {
    await expect(getLogDirectory()).resolves.toBe('C:\\Logs');

    mocks.isTauri.mockReturnValue(false);
    await expect(getLogDirectory()).resolves.toBeNull();
  });
});
