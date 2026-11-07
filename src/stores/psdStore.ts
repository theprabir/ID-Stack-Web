import { create } from 'zustand';
import type {
  PsdProject,
  PsdPlaceholder,
  PsdLayerInfo,
  SideType,
  BarcodeConfig,
} from '@/types/psd';
import { parsePsdFile } from '@/services/psdService';
import {
  savePsdProjectRecord,
  loadFromIndexedDB,
  saveToIndexedDB,
  type PsdProjectRecord,
} from '@/services/storageService';
import type { BatchState } from '@/services/batchService';
import type { ImpositionSettings, NumberingSettings } from '@/services/impositionTypes';
import { DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';

/** IndexedDB key for the current project's imposition settings */
const IMPOSITION_SETTINGS_KEY = 'psd-imposition-settings';

/** Sanity limit (in any unit) above which a card size is clearly a raw
 * pixel count mistakenly stored as a physical size (pre-v0.6.1 bug). */
const CARD_SIZE_SANITY_LIMIT = 500;

/**
 * Settings written by earlier builds kept a page-numbering `numbering` block next
 * to a separate `cardNumbers` block. Only card numbers exist now, so old
 * settings are migrated once on restore.
 */
interface LegacyCardNumbers {
  enabled?: boolean;
  position?: NumberingSettings['position'];
  fontSize?: number;
  color?: string;
  margin?: number;
  prefix?: string;
  start?: number;
}

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
  addPlaceholder: (layer: PsdLayerInfo, side: SideType, role: 'text' | 'photo' | 'barcode') => void;
  removePlaceholder: (layerId: string) => void;
  renamePlaceholderKey: (layerId: string, key: string) => void;
  /** Turn a barcode placeholder on/off (renders live barcode vs demo image) */
  setBarcodeEnabled: (layerId: string, enabled: boolean) => void;
  /** Merge partial barcode settings (symbology, colours) into a placeholder */
  updateBarcodeConfig: (layerId: string, config: Partial<BarcodeConfig>) => void;
  /**
   * Override the font of a text placeholder with an uploaded family, or
   * clear the override (undefined / "") to fall back to the PSD's font.
   */
  setPlaceholderFont: (layerId: string, family?: string) => void;
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
      const stored = await loadFromIndexedDB<
        Omit<ImpositionSettings, 'numbering'> & {
          numbering?: Partial<NumberingSettings>;
          cardNumbers?: LegacyCardNumbers;
        }
      >(IMPOSITION_SETTINGS_KEY);
      if (stored && typeof stored === 'object' && stored.paper && stored.numbering) {
        const {
          cardNumbers: legacyCardNumbers,
          numbering: storedNumbering,
          ...rest
        } = stored;
        // Merge over defaults so newly added fields always have values.
        const merged: ImpositionSettings = { ...DEFAULT_IMPOSITION_SETTINGS, ...rest };

        // `numbering` now controls CARD numbers (mode + look in one
        // block). Old page-numbering settings must never start printing card
        // numbers by surprise: migrate a previously enabled cardNumbers block
        // (which was continuous across sheets) and otherwise stay off.
        const isCardNumberShape =
          'margin' in (storedNumbering ?? {}) && 'start' in (storedNumbering ?? {});
        if (isCardNumberShape) {
          merged.numbering = {
            ...DEFAULT_IMPOSITION_SETTINGS.numbering,
            ...storedNumbering,
          };
        } else {
          merged.numbering = legacyCardNumbers?.enabled
            ? {
                mode: 'continuous',
                position:
                  legacyCardNumbers.position ?? DEFAULT_IMPOSITION_SETTINGS.numbering.position,
                fontSize:
                  legacyCardNumbers.fontSize ?? DEFAULT_IMPOSITION_SETTINGS.numbering.fontSize,
                color: legacyCardNumbers.color ?? DEFAULT_IMPOSITION_SETTINGS.numbering.color,
                margin: legacyCardNumbers.margin ?? DEFAULT_IMPOSITION_SETTINGS.numbering.margin,
                prefix: legacyCardNumbers.prefix ?? '',
                start: legacyCardNumbers.start ?? 1,
              }
            : { ...DEFAULT_IMPOSITION_SETTINGS.numbering };
        }

        // v0.6.1 fix: sizes written before DPI-aware derivation are raw
        // pixel counts (e.g. "622 cm") and can never fit any paper — discard
        // them so the PSD-locked derivation starts from the true default.
        if (merged.cardWidth > CARD_SIZE_SANITY_LIMIT || merged.cardHeight > CARD_SIZE_SANITY_LIMIT) {
          merged.cardWidth = DEFAULT_IMPOSITION_SETTINGS.cardWidth;
          merged.cardHeight = DEFAULT_IMPOSITION_SETTINGS.cardHeight;
        }
        set({ impositionSettings: merged });
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
      // Barcode layers start enabled with sensible defaults sized to the
      // chosen image's exact bounds (the demo barcode's box).
      ...(role === 'barcode'
        ? {
            barcodeEnabled: true,
            barcodeConfig: {
              symbology: 'ean13',
              color: '#000000',
              background: '#ffffff',
              width: Math.max(1, Math.round(layer.bounds.right - layer.bounds.left)),
              height: Math.max(1, Math.round(layer.bounds.bottom - layer.bounds.top)),
            } satisfies BarcodeConfig,
          }
        : {}),
    };
    set({ project: { ...project, placeholders: [...project.placeholders, placeholder] } });
  },

  setBarcodeEnabled: (layerId, enabled) => {
    const project = get().project;
    set({
      project: {
        ...project,
        placeholders: project.placeholders.map((placeholder) =>
          placeholder.layerId === layerId ? { ...placeholder, barcodeEnabled: enabled } : placeholder
        ),
      },
    });
  },

  updateBarcodeConfig: (layerId, config) => {
    const project = get().project;
    set({
      project: {
        ...project,
        placeholders: project.placeholders.map((placeholder) =>
          placeholder.layerId === layerId && placeholder.barcodeConfig
            ? { ...placeholder, barcodeConfig: { ...placeholder.barcodeConfig, ...config } }
            : placeholder
        ),
      },
    });
  },

  setPlaceholderFont: (layerId, family) => {
    const project = get().project;
    set({
      project: {
        ...project,
        placeholders: project.placeholders.map((placeholder) => {
          if (placeholder.layerId !== layerId) return placeholder;
          if (!family) {
            const next = { ...placeholder };
            delete next.fontFamily;
            return next;
          }
          return { ...placeholder, fontFamily: family };
        }),
      },
    });
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
