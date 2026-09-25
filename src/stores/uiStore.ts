import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Available theme modes */
export type ThemeMode = 'light' | 'dark';

interface UIState {
  /** Current theme mode ('light' | 'dark') */
  theme: ThemeMode;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether a global loading overlay is visible */
  isLoading: boolean;
  /** Whether an update prompt from the service worker is pending */
  updateAvailable: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLoading: (loading: boolean) => void;
  setUpdateAvailable: (available: boolean) => void;
}

/**
 * Global UI state: theme, layout and overlay flags.
 * Persisted to localStorage so theme preference survives reloads
 * (mirrored to IndexedDB by ThemeProvider).
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      isLoading: false,
      updateAvailable: false,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLoading: (isLoading) => set({ isLoading }),
      setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
    }),
    {
      name: 'id-card-ui-preferences',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
