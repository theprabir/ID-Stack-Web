import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(() => false),
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => undefined),
  save: vi.fn<(options: unknown) => Promise<unknown>>(async () => null),
  writeFile: vi.fn<(path: unknown, data: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.isTauri,
  invoke: mocks.invoke,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }));

import {
  clearRecentExports,
  formatBytes,
  getLastExportDirectory,
  getRecentExports,
  saveExport,
} from '@/services/exportService';

describe('exportService', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRecentExports();
    mocks.isTauri.mockReturnValue(false);
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
    mocks.save.mockReset();
    mocks.save.mockResolvedValue(null);
    mocks.writeFile.mockReset();
    mocks.writeFile.mockResolvedValue(undefined);
  });

  it('falls back to a browser download outside Tauri', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveExport(new Blob(['hello']), 'cards.zip');

    expect(result).toEqual({ status: 'downloaded', path: null, fileName: 'cards.zip' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();

    const [record] = getRecentExports();
    expect(record).toMatchObject({
      fileName: 'cards.zip',
      path: null,
      status: 'downloaded',
      bytes: 5,
    });
    click.mockRestore();
  });

  it('saves through the native dialog, grants the path and remembers the folder', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Jobs\\cards.zip');

    const result = await saveExport(new Blob(['abc']), 'cards.zip');

    expect(result).toEqual({ status: 'saved', path: 'C:\\Jobs\\cards.zip', fileName: 'cards.zip' });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'cards.zip',
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      })
    );
    expect(mocks.invoke).toHaveBeenCalledWith('allow_export_path', { path: 'C:\\Jobs\\cards.zip' });
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);

    const write = mocks.writeFile.mock.calls[0];
    expect(write).toBeDefined();
    expect(write?.[0]).toBe('C:\\Jobs\\cards.zip');
    expect((write?.[1] as Uint8Array).byteLength).toBe(3);

    expect(getLastExportDirectory()).toBe('C:\\Jobs');
    expect(getRecentExports()[0]).toMatchObject({
      status: 'saved',
      path: 'C:\\Jobs\\cards.zip',
      kind: 'export',
    });

    // The remembered folder pre-fills the next save.
    mocks.save.mockResolvedValue('C:\\Jobs\\next.pdf');
    await saveExport(new Blob(['x']), 'next.pdf');
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultPath: 'C:\\Jobs\\next.pdf',
        filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      })
    );
  });

  it('reports a cancelled dialog without recording an export', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue(null);

    const result = await saveExport(new Blob(['abc']), 'cards.pdf');

    expect(result).toEqual({ status: 'cancelled', path: null, fileName: 'cards.pdf' });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(getRecentExports()).toHaveLength(0);
  });

  it('records a failed write with its error', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Jobs\\cards.pdf');
    mocks.writeFile.mockRejectedValueOnce(new Error('disk full'));

    const result = await saveExport(new Blob(['abc']), 'cards.pdf');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('disk full');
    expect(getRecentExports()[0]).toMatchObject({ status: 'failed', error: 'disk full' });
  });

  it('replaces a repeated export instead of duplicating it', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Jobs\\cards.zip');

    await saveExport(new Blob(['a']), 'cards.zip');
    await saveExport(new Blob(['b']), 'cards.zip');

    const records = getRecentExports().filter((entry) => entry.fileName === 'cards.zip');
    expect(records).toHaveLength(1);
  });

  it('formats byte sizes for the recent-export list', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
