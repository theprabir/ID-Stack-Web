import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory, MAX_HISTORY_STEPS } from '@/hooks/useHistory';
import { createTemplate } from '@/services/templateService';
import type { CardTemplate } from '@/types/template';

describe('useHistory', () => {
  it('starts empty with no undo/redo', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('pushes states and undoes/redoes them', () => {
    const { result } = renderHook(() => useHistory());
    const base = createTemplate('Base');

    act(() => {
      result.current.reset(base);
    });

    const modified: CardTemplate = { ...base, name: 'Changed' };
    act(() => {
      result.current.pushState(modified, 'rename');
    });
    expect(result.current.canUndo).toBe(true);

    let restored: CardTemplate | null = null;
    act(() => {
      restored = result.current.undo() as CardTemplate | null;
    });
    expect((restored as CardTemplate | null)?.name).toBe('Base');
    expect(result.current.canRedo).toBe(true);

    let redone: CardTemplate | null = null;
    act(() => {
      redone = result.current.redo() as CardTemplate | null;
    });
    expect((redone as CardTemplate | null)?.name).toBe('Changed');
  });

  it('caps history at MAX_HISTORY_STEPS', () => {
    const { result } = renderHook(() => useHistory());
    const base = createTemplate('Base');
    act(() => {
      result.current.reset(base);
    });
    act(() => {
      for (let index = 0; index < MAX_HISTORY_STEPS + 10; index++) {
        result.current.pushState({ ...base, name: `v${index}` }, `step ${index}`);
      }
    });
    // Undo as far as possible; must not exceed the cap.
    // Each act() flushes re-render so canUndo/undo read fresh state.
    let undos = 0;
    while (result.current.canUndo && undos <= MAX_HISTORY_STEPS + 10) {
      act(() => {
        result.current.undo();
      });
      undos++;
    }
    expect(undos).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
  });

  it('clears redo stack on new push', () => {
    const { result } = renderHook(() => useHistory());
    const base = createTemplate('Base');
    act(() => {
      result.current.reset(base);
    });
    act(() => {
      result.current.pushState({ ...base, name: 'A' }, 'A');
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.pushState({ ...base, name: 'B' }, 'B');
    });
    expect(result.current.canRedo).toBe(false);
  });
});
