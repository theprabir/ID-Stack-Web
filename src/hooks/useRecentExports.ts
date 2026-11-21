import { useSyncExternalStore } from 'react';
import {
  getRecentExports,
  subscribeRecentExports,
  type ExportRecord,
} from '@/services/exportService';

/**
 * Recent exports, newest first. Re-renders the moment an export is saved or
 * the list is cleared.
 */
export function useRecentExports(): ExportRecord[] {
  return useSyncExternalStore(subscribeRecentExports, getRecentExports, getRecentExports);
}
