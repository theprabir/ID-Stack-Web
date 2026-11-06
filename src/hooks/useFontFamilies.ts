import { useSyncExternalStore } from 'react';
import { listLoadedFontFamilies, subscribeToFonts } from '@/services/fontService';

/**
 * Subscribe to the font registry and return the loaded family names.
 *
 * The registry is an external store (registered FontFaces mutate outside
 * React), so components use `useSyncExternalStore` to re-render when a font
 * is uploaded, restored from IndexedDB or removed.
 *
 * @returns Uploaded/bundled font family names
 */
export function useFontFamilies(): string[] {
  const snapshot = useSyncExternalStore(
    subscribeToFonts,
    () => listLoadedFontFamilies().join('\u0000'),
    () => ''
  );
  return snapshot.length > 0 ? snapshot.split('\u0000') : [];
}
