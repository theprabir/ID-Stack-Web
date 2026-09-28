import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Available theme modes (light/dark appearance) */
export type ThemeMode = 'light' | 'dark';

/** Available color palettes (independent of light/dark mode) */
export type ThemeId = 'classic' | 'lime' | 'teal';

/** All theme ids, for validation of persisted values */
export const THEME_IDS: ThemeId[] = ['classic', 'lime', 'teal'];

/** True when the value is a known theme id (persisted data may be stale) */
export function isValidThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
}

interface UIState {
  /** Current theme mode ('light' | 'dark') */
  theme: ThemeMode;
  /** Current color palette id ('classic' | 'lime' | 'teal') */
  themeId: ThemeId;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether a global loading overlay is visible */
  isLoading: boolean;
  /** Whether an update prompt from the service worker is pending */
  updateAvailable: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setThemeId: (themeId: ThemeId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLoading: (loading: boolean) => void;
  setUpdateAvailable: (available: boolean) => void;
}

/**
 * Global UI state: theme, layout and overlay flags.
 * Persisted to localStorage so the theme preference survives reloads
 * (mirrored to IndexedDB by ThemeProvider).
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      themeId: 'classic',
      sidebarCollapsed: false,
      isLoading: false,
      updateAvailable: false,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setThemeId: (themeId) => set({ themeId }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLoading: (isLoading) => set({ isLoading }),
      setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
    }),
    {
      name: 'id-stack-ui-preferences',
      partialize: (state) => ({ theme: state.theme, themeId: state.themeId }),
    }
  )
);
