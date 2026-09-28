import { useEffect, type PropsWithChildren } from 'react';
import { useUIStore, isValidThemeId } from '@/stores/uiStore';
import { saveToIndexedDB, loadFromIndexedDB } from '@/services/storageService';

const THEME_STORAGE_KEY = 'theme';
const UI_PREFERENCES_KEY = 'id-stack-ui-preferences';

/**
 * Wraps the application. Applies the `dark`/`light` class AND the
 * `data-theme` palette attribute to <html>, follows OS preference until the
 * user makes an explicit choice, and mirrors the theme to IndexedDB for
 * redundancy. Stale persisted theme ids (removed palettes) fall back to
 * 'classic'.
 */
export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const theme = useUIStore((state) => state.theme);
  const themeId = useUIStore((state) => state.themeId);
  const setTheme = useUIStore((state) => state.setTheme);
  const setThemeId = useUIStore((state) => state.setThemeId);

  // On first mount, if the user has never chosen a theme, adopt OS preference.
  useEffect(() => {
    const stored = localStorage.getItem(UI_PREFERENCES_KEY);
    if (!stored) {
      const osTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setTheme(osTheme);
    }
    if (!isValidThemeId(themeId)) {
      setThemeId('classic');
    }
  }, [themeId, setTheme, setThemeId]);

  // Apply the theme class + palette attribute (Tailwind darkMode: 'class').
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    root.dataset.theme = themeId;
  }, [theme, themeId]);

  // Mirror theme to IndexedDB so it persists even if localStorage is cleared.
  useEffect(() => {
    const mirror = async (): Promise<void> => {
      try {
        const saved = await loadFromIndexedDB<{ theme: string; themeId?: string }>(
          THEME_STORAGE_KEY
        );
        const next = { theme, themeId };
        if (!saved || saved.theme !== theme || saved.themeId !== themeId) {
          await saveToIndexedDB(THEME_STORAGE_KEY, next);
        }
      } catch (error) {
        console.warn('Failed to mirror theme to IndexedDB', error);
      }
    };
    void mirror();
  }, [theme, themeId]);

  return <>{children}</>;
}
