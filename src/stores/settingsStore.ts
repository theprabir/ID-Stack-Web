import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Measurement units for the editor */
export type UnitSystem = 'mm' | 'inch';

interface SettingsState {
  /** Measurement unit for rulers and property inputs */
  unit: UnitSystem;
  /** Auto-save templates after every change */
  autoSave: boolean;

  setUnit: (unit: UnitSystem) => void;
  setAutoSave: (autoSave: boolean) => void;
}

/**
 * User application settings (units, editor behaviour).
 * Persisted to localStorage.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      unit: 'mm',
      autoSave: true,

      setUnit: (unit) => set({ unit }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    {
      name: 'id-stack-settings',
    }
  )
);
