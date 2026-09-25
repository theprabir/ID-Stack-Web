import { useCallback, useRef, useState } from 'react';
import type { CardTemplate } from '@/types/template';

/** Minimum history depth required by Design.md */
export const MAX_HISTORY_STEPS = 50;

interface HistoryEntry {
  template: CardTemplate;
  label: string;
}

interface UseHistoryResult {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Push a snapshot after a change (labels appear in the history list). */
  pushState: (template: CardTemplate, label: string) => void;
  /** Revert to the previous snapshot; returns it or null. */
  undo: () => CardTemplate | null;
  /** Re-apply the next snapshot; returns it or null. */
  redo: () => CardTemplate | null;
  /** Jump to a specific history index; returns that snapshot or null. */
  jumpTo: (index: number) => CardTemplate | null;
  /** Labels of all past states (oldest first). */
  labels: string[];
  /** Index of the current state within labels. */
  currentIndex: number;
  /** Clear all history (e.g. on template load). */
  reset: (template: CardTemplate) => void;
}

/**
 * Snapshot-based undo/redo for the template editor.
 * Keeps the last MAX_HISTORY_STEPS states; jump-to-any-state supported.
 */
export function useHistory(): UseHistoryResult {
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<HistoryEntry | null>(null);
  const isRestoring = useRef(false);

  /** True while a programmatic restore is in flight (skip pushState). */
  const beginRestore = (): void => {
    isRestoring.current = true;
  };

  const endRestore = (): void => {
    isRestoring.current = false;
  };

  const pushState = useCallback(
    (template: CardTemplate, label: string): void => {
      if (isRestoring.current) return;
      setPast((previousPast) => {
        const next = current ? [...previousPast, current] : previousPast;
        return next.slice(-MAX_HISTORY_STEPS);
      });
      setCurrent({ template: structuredClone(template), label });
      setFuture([]);
    },
    [current]
  );

  const undo = useCallback((): CardTemplate | null => {
    if (past.length === 0 || !current) return null;
    const previous = past[past.length - 1];
    if (!previous) return null;
    beginRestore();
    setPast((entries) => entries.slice(0, -1));
    setFuture((entries) => [current, ...entries].slice(0, MAX_HISTORY_STEPS));
    setCurrent(previous);
    endRestore();
    return structuredClone(previous.template);
  }, [past, current]);

  const redo = useCallback((): CardTemplate | null => {
    if (future.length === 0 || !current) return null;
    const next = future[0];
    if (!next) return null;
    beginRestore();
    setFuture((entries) => entries.slice(1));
    setPast((entries) => [...entries, current].slice(-MAX_HISTORY_STEPS));
    setCurrent(next);
    endRestore();
    return structuredClone(next.template);
  }, [future, current]);

  const jumpTo = useCallback(
    (index: number): CardTemplate | null => {
      const all = [...past, current, ...future];
      const target = all[index];
      if (!target || !current) return null;
      const targetIndex = all.indexOf(target);
      const currentIndex = past.length;
      if (targetIndex === currentIndex) return null;
      beginRestore();
      const entries = all.filter((entry): entry is HistoryEntry => entry !== null);
      setPast(entries.slice(0, targetIndex));
      setFuture(entries.slice(targetIndex + 1));
      setCurrent(target);
      endRestore();
      return structuredClone(target.template);
    },
    [past, future, current]
  );

  const reset = useCallback((template: CardTemplate): void => {
    setPast([]);
    setFuture([]);
    setCurrent({ template: structuredClone(template), label: 'init' });
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pushState,
    undo,
    redo,
    jumpTo,
    labels: [...past.map((entry) => entry.label), current?.label ?? ''].filter(Boolean),
    currentIndex: past.length,
    reset,
  };
}
