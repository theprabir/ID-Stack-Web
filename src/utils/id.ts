/**
 * Generate a unique element/template id.
 * Uses Web Crypto when available, falls back to Math.random.
 * @returns A reasonably unique id string
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
