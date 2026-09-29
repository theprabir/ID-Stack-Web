import Dexie, { type Table } from 'dexie';

/** A record stored in the key-value table (settings, theme mirror, etc.) */
export interface KeyValueRecord {
  key: string;
  value: unknown;
}

/** PSD project record (placeholders + design metadata) */
export interface PsdProjectRecord {
  id: string;
  name: string;
  createdDate: string;
  modifiedDate: string;
  /** Raw PSD bytes (nullable — large designs are re-uploaded per session) */
  frontPsd: ArrayBuffer | null;
  backPsd: ArrayBuffer | null;
  placeholders: unknown[];
}

/** Uploaded font record stored in IndexedDB */
export interface FontRecord {
  name: string;
  fileName: string;
  /** Font file bytes, loadable via FontFace API */
  buffer: ArrayBuffer;
  addedDate: string;
}

/**
 * Dexie database. Per Architecture.md, this is the app's only "database" —
 * everything is client-side.
 */
export class IdStackDatabase extends Dexie {
  public keyValue!: Table<KeyValueRecord, string>;
  public fonts!: Table<FontRecord, string>;
  public psdProjects!: Table<PsdProjectRecord, string>;

  public constructor() {
    super('id-stack');
    this.version(1).stores({
      keyValue: 'key',
      fonts: 'name, fileName',
    });
    this.version(2).stores({
      psdProjects: 'id, name, modifiedDate',
    });
  }
}

let databaseInstance: IdStackDatabase | null = null;

/**
 * Get (and lazily create) the singleton database instance.
 * @returns The Dexie database
 */
export function getDatabase(): IdStackDatabase {
  if (!databaseInstance) {
    databaseInstance = new IdStackDatabase();
  }
  return databaseInstance;
}

/**
 * Save an arbitrary value under a key (used for settings/theme mirroring).
 * @param key - Unique key
 * @param data - Any structured-clone-compatible value
 */
export async function saveToIndexedDB(key: string, data: unknown): Promise<void> {
  await getDatabase().keyValue.put({ key, value: data });
}

/**
 * Load a value by key.
 * @typeParam T - Expected value type
 * @param key - Unique key
 * @returns The stored value or null when missing
 */
export async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  const record = await getDatabase().keyValue.get(key);
  return record ? (record.value as T) : null;
}

/**
 * Delete a key-value record.
 * @param key - Unique key
 */
export async function deleteFromIndexedDB(key: string): Promise<void> {
  await getDatabase().keyValue.delete(key);
}

/**
 * List all key-value keys.
 * @returns All stored keys
 */
export async function listIndexedDBKeys(): Promise<string[]> {
  const records = await getDatabase().keyValue.toArray();
  return records.map((record) => record.key);
}

/**
 * Persist an uploaded font for offline use.
 * @param record - Font record with the raw font file buffer
 */
export async function saveFontRecord(record: FontRecord): Promise<void> {
  await getDatabase().fonts.put(record);
}

/**
 * Delete an uploaded font.
 * @param name - Font family name
 */
export async function deleteFontRecord(name: string): Promise<void> {
  await getDatabase().fonts.delete(name);
}

/**
 * List all uploaded fonts.
 * @returns Font records
 */
export async function listFontRecords(): Promise<FontRecord[]> {
  return getDatabase().fonts.toArray();
}

/**
 * Persist the PSD project record (placeholders, mappings, metadata).
 * @param record - Project record to save
 */
export async function savePsdProjectRecord(record: PsdProjectRecord): Promise<void> {
  await getDatabase().psdProjects.put(record);
}

/**
 * Load the PSD project record.
 * @param id - Project id
 * @returns The record or null
 */
export async function loadPsdProjectRecord(id: string): Promise<PsdProjectRecord | null> {
  const record = await getDatabase().psdProjects.get(id);
  return record ?? null;
}
