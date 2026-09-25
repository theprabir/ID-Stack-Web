import Dexie, { type Table } from 'dexie';

/** A record stored in the key-value table (settings, theme mirror, etc.) */
export interface KeyValueRecord {
  key: string;
  value: unknown;
}

/** Template record stored in IndexedDB (serialised CardTemplate) */
export interface TemplateRecord {
  id: string;
  name: string;
  modifiedDate: string;
  data: unknown;
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
export class IdCardDatabase extends Dexie {
  public keyValue!: Table<KeyValueRecord, string>;
  public templates!: Table<TemplateRecord, string>;
  public fonts!: Table<FontRecord, string>;

  public constructor() {
    super('id-card-software');
    this.version(1).stores({
      keyValue: 'key',
      templates: 'id, name, modifiedDate',
      fonts: 'name, fileName',
    });
  }
}

let databaseInstance: IdCardDatabase | null = null;

/**
 * Get (and lazily create) the singleton database instance.
 * @returns The Dexie database
 */
export function getDatabase(): IdCardDatabase {
  if (!databaseInstance) {
    databaseInstance = new IdCardDatabase();
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
 * Save (or update) a template.
 * @param record - Template record to persist
 */
export async function saveTemplateRecord(record: TemplateRecord): Promise<void> {
  await getDatabase().templates.put(record);
}

/**
 * Load a template by id.
 * @param id - Template id
 * @returns The template record or null
 */
export async function loadTemplateRecord(id: string): Promise<TemplateRecord | null> {
  const record = await getDatabase().templates.get(id);
  return record ?? null;
}

/**
 * Delete a template by id.
 * @param id - Template id
 */
export async function deleteTemplateRecord(id: string): Promise<void> {
  await getDatabase().templates.delete(id);
}

/**
 * List all stored templates (summaries only — data is not returned).
 * @returns Template records, newest modification first
 */
export async function listTemplateRecords(): Promise<TemplateRecord[]> {
  return getDatabase().templates.orderBy('modifiedDate').reverse().toArray();
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
