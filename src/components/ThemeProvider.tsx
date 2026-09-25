import { useEffect, type PropsWithChildren } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { saveToIndexedDB, loadFromIndexedDB } from '@/services/storageService';

const THEME_STORAGE_KEY = 'theme';
const UI_PREFERENCES_KEY = 'id-stack-ui-preferences';

/**
 * Wraps the application. Applies the `dark`/`light` class to <html>,
 * follows OS preference until the user makes an explicit choice, and
 * mirrors the theme to IndexedDB for redundancy.
 */
export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  // On first mount, if the user has never chosen a theme, adopt OS preference.
  useEffect(() => {
    const stored = localStorage.getItem(UI_PREFERENCES_KEY);
    if (!stored) {
      const osTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setTheme(osTheme);
    }
  }, [setTheme]);

  // Apply the theme class to the root element (Tailwind darkMode: 'class').
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  }, [theme]);

  // Mirror theme to IndexedDB so it persists even if localStorage is cleared.
  useEffect(() => {
    const mirror = async (): Promise<void> => {
      try {
        const saved = await loadFromIndexedDB<string>(THEME_STORAGE_KEY);
        if (saved !== theme) {
          await saveToIndexedDB(THEME_STORAGE_KEY, theme);
        }
      } catch (error) {
        console.warn('Failed to mirror theme to IndexedDB', error);
      }
    };
    void mirror();
  }, [theme]);

  return <>{children}</>;
}
