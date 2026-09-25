import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LANGUAGE } from '@/constants/languages';

/** Measurement units for the editor */
export type UnitSystem = 'mm' | 'inch';

interface SettingsState {
  /** Interface language code (one of constants/languages) */
  language: string;
  /** Measurement unit for rulers and property inputs */
  unit: UnitSystem;
  /** Auto-save templates after every change */
  autoSave: boolean;

  setLanguage: (language: string) => void;
  setUnit: (unit: UnitSystem) => void;
  setAutoSave: (autoSave: boolean) => void;
}

/**
 * User application settings (language, units, editor behaviour).
 * Persisted to localStorage; language changes are applied to i18next
 * by useI18n.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      unit: 'mm',
      autoSave: true,

      setLanguage: (language) => set({ language }),
      setUnit: (unit) => set({ unit }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    {
      name: 'id-stack-settings',
    }
  )
);
