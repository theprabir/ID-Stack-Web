import { create } from 'zustand';
import type { PsdProject, PsdPlaceholder, PsdLayerInfo, SideType } from '@/types/psd';
import { parsePsdFile } from '@/services/psdService';
import {
  savePsdProjectRecord,
  loadFromIndexedDB,
  saveToIndexedDB,
  type PsdProjectRecord,
} from '@/services/storageService';
import type { BatchState } from '@/services/batchService';
import type { ImpositionSettings } from '@/services/impositionTypes';
import { DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';

/** IndexedDB key for the current project's imposition settings */
const IMPOSITION_SETTINGS_KEY = 'psd-imposition-settings';

/** Batch state/control slice embedded in the PSD store */
export interface PsdStoreBatchSlice {
  batchState: BatchState | null;
  batchControl: 'running' | 'paused' | 'cancelled' | 'done';
  setBatchState: (state: BatchState | null) => void;
  setBatchControl: (control: 'running' | 'paused' | 'cancelled' | 'done') => void;
}

interface PsdState extends PsdStoreBatchSlice {
  project: PsdProject;
  projectName: string;
  isParsing: boolean;
  parseError: string | null;
  isSaving: boolean;
  lastSaved: string | null;
  batchState: BatchState | null;
  batchControl: 'running' | 'paused' | 'cancelled' | 'done';

  /** Parse and set the design for one side. */
  loadPsd: (file: File, side: SideType) => Promise<void>;
  /** Remove the design of one side (and its placeholders). */
  clearSide: (side: SideType) => void;
  /** Toggle/drop placeholder selection. */
  addPlaceholder: (layer: PsdLayerInfo, side: SideType, role: 'text' | 'photo') => void;
  removePlaceholder: (layerId: string) => void;
  renamePlaceholderKey: (layerId: string, key: string) => void;
  /** Persist the project (PSD bytes + placeholders) to IndexedDB. */
  saveProject: () => Promise<void>;
  /** Imposition settings (persisted per project, survive reloads) */
  impositionSettings: ImpositionSettings;
  /** Update imposition settings (in memory + IndexedDB) */
  setImpositionSettings: (settings: ImpositionSettings) => void;
  /** Restore imposition settings from IndexedDB (call at startup) */
  restoreImpositionSettings: () => Promise<void>;
  /** Reset everything. */
  resetProject: () => void;
}

const EMPTY_PROJECT: PsdProject = {
  front: null,
  back: null,
  placeholders: [],
};

/**
 * Owns the PSD-first project: both designs, the user-chosen placeholder
 * layers and persistence. Excel/photos/mappings stay in dataStore.
 */
export const usePsdStore = create<PsdState>()((set, get) => ({
  project: EMPTY_PROJECT,
  projectName: 'Untitled project',
  isParsing: false,
  parseError: null,
  isSaving: false,
  lastSaved: null,
  batchState: null,
  batchControl: 'done',
  impositionSettings: DEFAULT_IMPOSITION_SETTINGS,
  setBatchState: (batchState) => set({ batchState }),
  setBatchControl: (batchControl) => set({ batchControl }),

  setImpositionSettings: (settings) => {
    set({ impositionSettings: settings });
    void saveToIndexedDB(IMPOSITION_SETTINGS_KEY, settings).catch(() => {
      // Persistence failure must not break the UI — settings stay in memory.
    });
  },

  restoreImpositionSettings: async () => {
    try {
      const stored = await loadFromIndexedDB<ImpositionSettings>(IMPOSITION_SETTINGS_KEY);
      if (stored && typeof stored === 'object' && stored.paper && stored.numbering) {
        // Merge over defaults so newly added fields always have values.
        set({ impositionSettings: { ...DEFAULT_IMPOSITION_SETTINGS, ...stored } });
      }
    } catch {
      // Missing/corrupt settings fall back to defaults.
    }
  },

  loadPsd: async (file, side) => {
    set({ isParsing: true, parseError: null });
    try {
      const design = await parsePsdFile(file, side);
      const project = get().project;
      // Drop placeholders of that side before replacing the design.
      const placeholders = project.placeholders.filter((placeholder) => placeholder.side !== side);
      set({
        project: { ...project, [side]: design, placeholders },
        isParsing: false,
      });
    } catch (error) {
      set({
        isParsing: false,
        parseError: error instanceof Error ? error.message : 'Unknown PSD error',
      });
    }
  },

  clearSide: (side) => {
    const project = get().project;
    set({
      project: {
        ...project,
        [side]: null,
        placeholders: project.placeholders.filter((placeholder) => placeholder.side !== side),
      },
    });
  },

  addPlaceholder: (layer, side, role) => {
    const project = get().project;
    if (project.placeholders.some((placeholder) => placeholder.layerId === layer.id)) return;
    const placeholder: PsdPlaceholder = {
      layerId: layer.id,
      layerName: layer.name,
      role,
      side,
      key: layer.name,
    };
    set({ project: { ...project, placeholders: [...project.placeholders, placeholder] } });
  },

  removePlaceholder: (layerId) => {
    const project = get().project;
    set({
      project: {
        ...project,
        placeholders: project.placeholders.filter((placeholder) => placeholder.layerId !== layerId),
      },
    });
  },

  renamePlaceholderKey: (layerId, key) => {
    const project = get().project;
    set({
      project: {
        ...project,
        placeholders: project.placeholders.map((placeholder) =>
          placeholder.layerId === layerId ? { ...placeholder, key } : placeholder
        ),
      },
    });
  },

  saveProject: async () => {
    const { project, projectName } = get();
    set({ isSaving: true });
    try {
      const record: PsdProjectRecord = {
        id: `current`,
        name: projectName,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        frontPsd: null,
        backPsd: null,
        placeholders: project.placeholders,
      };
      // Note: PSD bytes are intentionally not persisted (browser storage
      // limits); designs are re-uploaded per session. Placeholders and
      // mappings are saved.
      await savePsdProjectRecord({ ...record, frontPsd: null, backPsd: null });
      set({ lastSaved: new Date().toISOString(), isSaving: false });
    } catch {
      set({ isSaving: false });
    }
  },

  resetProject: () => {
    set({ project: EMPTY_PROJECT, projectName: 'Untitled project', parseError: null });
  },
}));
