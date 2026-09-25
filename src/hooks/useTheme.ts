import { useCallback, useMemo } from 'react';
import { useUIStore, type ThemeMode } from '@/stores/uiStore';

interface UseThemeResult {
  /** Current theme mode */
  theme: ThemeMode;
  /** Set an explicit theme */
  setTheme: (theme: ThemeMode) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
}

/**
 * Access the app theme from any component.
 * @returns The current theme plus setters
 */
export function useTheme(): UseThemeResult {
  const theme = useUIStore((state) => state.theme);
  const setThemeAction = useUIStore((state) => state.setTheme);
  const toggleThemeAction = useUIStore((state) => state.toggleTheme);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeAction(next);
    },
    [setThemeAction]
  );

  const toggleTheme = useCallback(() => {
    toggleThemeAction();
  }, [toggleThemeAction]);

  return useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
}
