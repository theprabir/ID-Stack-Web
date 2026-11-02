import { create } from 'zustand';
import type {
  ExcelData,
  PhotoRecord,
  ColumnMapping,
  ValidationResult,
  PhotoMatchConfig,
  PhotoMatchResult,
} from '@/types/data';
import { parseExcelFile, validateData, type ValidateOptions } from '@/services/excelService';
import {
  loadPhotos as loadPhotosService,
  matchPhotos,
  disposePhotos,
  isSupportedImage,
} from '@/services/photoService';
import { usePsdStore } from './psdStore';

/** Number of rows shown in the preview table */
export const PREVIEW_ROW_COUNT = 5;

interface DataState {
  excelData: ExcelData | null;
  isParsing: boolean;
  parseError: string | null;

  photos: PhotoRecord[];
  isLoadingPhotos: boolean;
  photoError: string | null;
  photoMatchConfig: PhotoMatchConfig;
  photoMatchResult: PhotoMatchResult | null;

  /** placeholder → column */
  mappings: Record<string, string>;
  validation: ValidationResult | null;

  /** Parse and store an Excel/CSV file. */
  loadExcel: (file: File) => Promise<void>;
  /** Clear Excel data and mappings (keeps photos). */
  clearExcel: () => void;
  /** Load image files as photos with auto-matching refresh. */
  loadPhotos: (files: FileList | File[]) => Promise<void>;
  /** Remove a single photo (revokes its blob URL). */
  removePhoto: (photoId: string) => void;
  /** Remove all photos (revokes blob URLs). */
  clearPhotos: () => void;
  /** Change the photo matching strategy. */
  setPhotoMatchMode: (mode: PhotoMatchConfig['mode'], columnName?: string) => void;
  /** Assign a photo to a row manually. */
  assignPhotoManually: (rowIndex: number, photoId: string) => void;
  /** Map a placeholder to an Excel column ('' to unmap). */
  setMapping: (placeholder: string, column: string) => void;
  /** Auto-map placeholders to columns with equal (case-insensitive) names. */
  autoMapColumns: () => void;
  /** Re-run validation against current data/mappings/photos. */
  revalidate: () => ValidationResult;
  /** Clear everything (Excel + photos + mappings). */
  clearAll: () => void;
}

/**
 * Owns imported Excel data, photos, column mappings and validation state.
 * Derives placeholders from the PSD design's placeholder layers so the
 * mapping UI stays in sync with PSD Studio.
 */
export const useDataStore = create<DataState>()((set, get) => ({
  excelData: null,
  isParsing: false,
  parseError: null,

  photos: [],
  isLoadingPhotos: false,
  photoError: null,
  photoMatchConfig: { mode: 'filename' },
  photoMatchResult: null,

  mappings: {},
  validation: null,

  loadExcel: async (file) => {
    set({ isParsing: true, parseError: null });
    try {
      const excelData = await parseExcelFile(file);
      set({ excelData, isParsing: false });
      // Auto-map once on import for a zero-config start.
      get().autoMapColumns();
      get().revalidate();
    } catch (error) {
      set({
        isParsing: false,
        parseError: error instanceof Error ? error.message : 'Unknown parsing error',
      });
    }
  },

  clearExcel: () => {
    set({ excelData: null, mappings: {}, validation: null, parseError: null });
  },

  loadPhotos: async (files) => {
    set({ isLoadingPhotos: true, photoError: null });
    try {
      const incoming = Array.from(files).filter(isSupportedImage);
      if (incoming.length === 0) {
        set({
          isLoadingPhotos: false,
          photoError: 'No supported image files found (.jpg, .png, .webp…).',
        });
        return;
      }
      const loaded = await loadPhotosService(incoming);
      const photos = [...get().photos, ...loaded];
      set({ photos, isLoadingPhotos: false });
      get().revalidate();
    } catch (error) {
      set({
        isLoadingPhotos: false,
        photoError: error instanceof Error ? error.message : 'Unknown photo import error',
      });
    }
  },

  removePhoto: (photoId) => {
    const photo = get().photos.find((candidate) => candidate.id === photoId);
    if (photo) disposePhotos([photo]);
    set({ photos: get().photos.filter((candidate) => candidate.id !== photoId) });
    get().revalidate();
  },

  clearPhotos: () => {
    disposePhotos(get().photos);
    set({ photos: [], photoMatchResult: null });
    get().revalidate();
  },

  setPhotoMatchMode: (mode, columnName) => {
    const current = get().photoMatchConfig;
    const config: PhotoMatchConfig =
      mode === 'column'
        ? { mode, columnName: columnName ?? current.columnName ?? '' }
        : mode === 'manual'
          ? { mode, manualAssignments: current.manualAssignments ?? {} }
          : { mode };
    set({ photoMatchConfig: config, photoMatchResult: null });
    get().revalidate();
  },

  assignPhotoManually: (rowIndex, photoId) => {
    const config = get().photoMatchConfig;
    if (config.mode !== 'manual') return;
    const manualAssignments = { ...(config.manualAssignments ?? {}) };
    if (photoId.length === 0) {
      delete manualAssignments[rowIndex];
    } else {
      manualAssignments[rowIndex] = photoId;
    }
    set({ photoMatchConfig: { ...config, manualAssignments } });
    get().revalidate();
  },

  setMapping: (placeholder, column) => {
    const mappings = { ...get().mappings };
    if (column.length === 0) {
      delete mappings[placeholder];
    } else {
      mappings[placeholder] = column;
    }
    set({ mappings });
    get().revalidate();
  },

  autoMapColumns: () => {
    const { excelData } = get();
    if (!excelData) return;
    // Placeholder keys come from the PSD design's placeholder layers.
    const psdProject = usePsdStore.getState().project;
    const keys = psdProject.placeholders.map((placeholder) => placeholder.key);

    const synonymDictionary: Record<string, string[]> = {
      Name: ['empname', 'fullname', 'employee name', 'user', 'first name', 'last name'],
      ID: ['empid', 'serial', 'roll no', 'employee id'],
      Photo: ['image', 'picture', 'profile'],
      // Add more synonyms as needed
    };

    const scoreMapping = (placeholder: string, column: string): number => {
      const phLower = placeholder.toLowerCase().trim();
      const colLower = column.toLowerCase().trim();
      // Empty headers must never match: String.includes('') is always true,
      // so a blank column would otherwise score 80 against every placeholder.
      if (phLower.length === 0 || colLower.length === 0) return 0;

      // Score 100: Exact match (case-insensitive)
      if (phLower === colLower) return 100;

      // Score 80: Column header is a substring of placeholder name (or vice versa)
      if (phLower.includes(colLower) || colLower.includes(phLower)) return 80;

      // Score 60: Column header matches a synonym FOR THIS placeholder only.
      // (Matching synonyms of *any* placeholder wrongly paired e.g. the
      // column "User" with the placeholder "Photo" — "user" is a Name synonym.)
      const synonyms = Object.entries(synonymDictionary).find(
        ([key]) => key.toLowerCase() === phLower
      )?.[1];
      if (synonyms?.some((syn) => colLower === syn.toLowerCase())) return 60;

      // Score 40: Both strings share a common "core" keyword
      const phWords = phLower.split(/\s+/);
      const colWords = colLower.split(/\s+/);
      const sharedWords = phWords.filter((w) => colWords.includes(w));
      if (sharedWords.length > 0) return 40;

      // Default: no match
      return 0;
    };

    const mappings: Record<string, string> = {};
    for (const key of keys) {
      let bestColumn: string | null = null;
      let bestScore = 0;
      for (const column of excelData.columns) {
        const score = scoreMapping(key, column);
        if (score > bestScore) {
          bestScore = score;
          bestColumn = column;
        }
      }
      // Only map if score is above threshold (e.g., > 40)
      if (bestScore > 40 && bestColumn) {
        mappings[key] = bestColumn;
      }
    }
    set({ mappings });
  },

  revalidate: () => {
    const { excelData, mappings, photos, photoMatchConfig } = get();
    if (!excelData) {
      set({ validation: null, photoMatchResult: null });
      return { valid: true, issues: [], validRowIndexes: [] };
    }

    const psdProject = usePsdStore.getState().project;
    const placeholders = psdProject.placeholders.map((placeholder) => placeholder.key);

    const mappingList: ColumnMapping[] = placeholders.map((placeholder) => ({
      placeholder,
      column: mappings[placeholder] ?? '',
    }));

    // Photo matching run so preview + validation share one result.
    const photoMatchResult = matchPhotos(excelData.rows, photos, photoMatchConfig);
    set({ photoMatchResult });

    const photoColumn =
      photoMatchConfig.mode === 'column' ? photoMatchConfig.columnName : undefined;
    const options: ValidateOptions = {
      requiredPlaceholders: placeholders,
      photoColumn,
      photoBaseNames: new Set(photos.map((photo) => photo.baseName)),
    };

    const validation = validateData(excelData, mappingList, options);
    set({ validation });
    return validation;
  },

  clearAll: () => {
    disposePhotos(get().photos);
    set({
      excelData: null,
      isParsing: false,
      parseError: null,
      photos: [],
      isLoadingPhotos: false,
      photoError: null,
      photoMatchResult: null,
      mappings: {},
      validation: null,
    });
  },
}));
