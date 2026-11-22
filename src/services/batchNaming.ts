/**
 * Batch output file-naming helpers.
 * Supports {Row}, {ColumnName} and {{ColumnName}} tokens with sanitisation
 * of characters that are invalid in file names.
 */

/** Sanitise a file name token */
function sanitizeToken(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim();
}

/**
 * Build the output file base name from the naming template.
 *
 * @param template - Naming template, e.g. "{Name}_{Row}" or "{{ID}}-{{Name}}"
 * @param row - The data row providing token values
 * @returns The assembled file base name (no extension)
 */
export function buildName(
  template: string,
  row: { rowIndex: number; values: Record<string, string> }
): string {
  const paddedRow = String(row.rowIndex + 1).padStart(3, '0');

  // {{Column}} syntax first (so {Column} doesn't consume its braces).
  let name = template.replace(/\{\{([^}]+)\}\}/g, (match, column: string) => {
    const value = row.values[column.trim()];
    return value !== undefined && value.length > 0 ? sanitizeToken(value) : match;
  });

  name = name.replace(/\{(\w+)\}/g, (match, token: string) => {
    if (token === 'Row') return paddedRow;
    const value = row.values[token];
    return value !== undefined && value.length > 0 ? sanitizeToken(value) : match;
  });

  return name;
}

/**
 * Make a file name unique inside one archive (v0.7.6).
 *
 * JSZip silently replaces an existing entry with the same path, which is how
 * two classes both named "Class 5" — or a naming template that omits {Row} —
 * lost every file but the last. Duplicates get a ` (2)`, ` (3)`… suffix before
 * the extension, in the OS convention users already understand.
 *
 * @param used - Set of lowercased names already added (mutated)
 * @param fileName - Desired file name
 * @returns A name that is not in `used` (registered in the set)
 */
export function uniqueFileName(used: Set<string>, fileName: string): string {
  const key = fileName.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return fileName;
  }
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  let counter = 2;
  let candidate = `${stem} (${counter})${extension}`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem} (${counter})${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Sanitise one archive folder/file segment (Windows-invalid characters).
 *
 * @param value - Raw segment
 * @returns Safe segment ("source" when nothing usable remains)
 */
export function sanitizeSegment(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
  return cleaned.length > 0 ? cleaned : 'source';
}
