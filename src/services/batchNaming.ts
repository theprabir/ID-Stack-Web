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
