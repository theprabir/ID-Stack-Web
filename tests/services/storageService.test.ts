import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveToIndexedDB,
  loadFromIndexedDB,
  deleteFromIndexedDB,
  listIndexedDBKeys,
  saveTemplateRecord,
  loadTemplateRecord,
  listTemplateRecords,
  deleteTemplateRecord,
  saveFontRecord,
  listFontRecords,
  deleteFontRecord,
} from '@/services/storageService';
import { getDatabase } from '@/services/storageService';

describe('storageService', () => {
  beforeEach(async () => {
    await getDatabase().delete();
    // Recreate after wipe
    getDatabase().open();
  });

  afterEach(async () => {
    await getDatabase().delete();
  });

  it('stores and loads key-value records', async () => {
    await saveToIndexedDB('theme', 'dark');
    await expect(loadFromIndexedDB<string>('theme')).resolves.toBe('dark');
  });

  it('returns null for missing keys', async () => {
    await expect(loadFromIndexedDB('missing')).resolves.toBeNull();
  });

  it('deletes key-value records and lists keys', async () => {
    await saveToIndexedDB('a', 1);
    await saveToIndexedDB('b', 2);
    await expect(listIndexedDBKeys()).resolves.toContain('a');
    await deleteFromIndexedDB('a');
    await expect(loadFromIndexedDB('a')).resolves.toBeNull();
  });

  it('saves, loads and deletes templates', async () => {
    const record = {
      id: 'tpl-1',
      name: 'Employee Card',
      modifiedDate: '2026-09-25T00:00:00.000Z',
      data: { frontSide: {}, backSide: {} },
    };
    await saveTemplateRecord(record);
    await expect(loadTemplateRecord('tpl-1')).resolves.toMatchObject({ name: 'Employee Card' });
    await expect(listTemplateRecords()).resolves.toHaveLength(1);
    await deleteTemplateRecord('tpl-1');
    await expect(loadTemplateRecord('tpl-1')).resolves.toBeNull();
  });

  it('saves, lists and deletes fonts', async () => {
    const buffer = new ArrayBuffer(8);
    await saveFontRecord({
      name: 'MyFont',
      fileName: 'MyFont.ttf',
      buffer,
      addedDate: '2026-09-25',
    });
    const fonts = await listFontRecords();
    expect(fonts).toHaveLength(1);
    expect(fonts[0]?.name).toBe('MyFont');
    await deleteFontRecord('MyFont');
    await expect(listFontRecords()).resolves.toHaveLength(0);
  });
});
