import { create } from 'zustand';
import type {
  ExcelData,
  ExcelSource,
  PhotoRecord,
  PhotoLibrary,
  ColumnMapping,
  ValidationResult,
  PhotoMatchConfig,
  PhotoMatchResult,
} from '@/types/data';
import {
  parseExcelSources,
  isSupportedSpreadsheet,
  alignSourceColumns,
  validateData,
  type ValidateOptions,
} from '@/services/excelService';
import {
  loadPhotos as loadPhotosService,
  matchPhotos,
  disposePhotos,
  isSupportedImage,
} from '@/services/photoService';
import { autoMapLibraries, extractPhotoLibrary, isZipFile } from '@/services/photoZipService';
import { generateId } from '@/utils/id';
import { usePsdStore } from './psdStore';

/** Number of rows shown in the preview table */
export const PREVIEW_ROW_COUNT = 5;

/** Display name of the loose-image library */
const LOOSE_LIBRARY_NAME = 'Loose images';

interface DataState {
  /** Every imported source, including ones blocked by a column mismatch */
  sources: ExcelSource[];
  activeSourceId: string | null;
  /** Active source as legacy ExcelData (mapping/preview UI) */
  excelData: ExcelData | null;
  isParsing: boolean;
  parseError: string | null;

  photoLibraries: PhotoLibrary[];
  /** sourceId → photo library id (explicit user/auto mapping) */
  photoSourceMap: Record<string, string>;
  /** Flat union of all libraries (thumbnails, legacy callers) */
  photos: PhotoRecord[];
  isLoadingPhotos: boolean;
  photoZipProgress: number | null;
  photoError: string | null;
  photoMatchConfig: PhotoMatchConfig;
  photoMatchResult: PhotoMatchResult | null;
  /** Per-source match results used by batch generation */
  photoMatchBySource: Record<string, PhotoMatchResult>;

  /** placeholder → column */
  mappings: Record<string, string>;
  validation: ValidationResult | null;

  /** Import one or more spreadsheets into data sources. */
  loadExcel: (file: File) => Promise<void>;
  importSpreadsheets: (files: FileList | File[]) => Promise<void>;
  /** Remove one source (its photo mapping and manual picks go with it). */
  removeSource: (sourceId: string) => void;
  setActiveSource: (sourceId: string) => void;
  /** Clear Excel data and mappings (keeps photos). */
  clearExcel: () => void;
  /** Load image files as photos with auto-matching refresh. */
  loadPhotos: (files: FileList | File[]) => Promise<void>;
  /** Load images and/or ZIP archives in one gesture. */
  loadPhotoInputs: (files: FileList | File[]) => Promise<void>;
  /** Extract one ZIP into its own photo library. */
  importPhotoZip: (file: File) => Promise<void>;
  /** Map a source to a photo library ('' clears the mapping). */
  mapPhotoLibrary: (sourceId: string, libraryId: string) => void;
  /** Remove a whole photo library (revokes its blob URLs). */
  removePhotoLibrary: (libraryId: string) => void;
  /** Remove a single photo (revokes its blob URL). */
  removePhoto: (photoId: string) => void;
  /** Remove all photos (revokes blob URLs). */
  clearPhotos: () => void;
  /** Change the photo matching strategy. */
  setPhotoMatchMode: (mode: PhotoMatchConfig['mode'], columnName?: string) => void;
  /** Assign a photo to a row manually (row key: uid or rowIndex). */
  assignPhotoManually: (rowKeyValue: number | string, photoId: string) => void;
  /** Map a placeholder to an Excel column ('' to unmap). */
  setMapping: (placeholder: string, column: string) => void;
  /** Auto-map placeholders to columns with equal (case-insensitive) names. */
  autoMapColumns: () => void;
  /** Re-run validation against current data/mappings/photos. */
  revalidate: () => ValidationResult;
  /** Clear everything (Excel + photos + mappings). */
  clearAll: () => void;
}

/** Active source fallback: the first usable source, else the first */
function resolveActive(sources: ExcelSource[], activeSourceId: string | null): ExcelSource | null {
  const requested = sources.find((source) => source.id === activeSourceId);
  if (requested && !requested.error) return requested;
  // A blocked source must never become the validation/preview source while a
  // usable one exists, or the table and its error list would disagree.
  return sources.find((source) => !source.error) ?? requested ?? sources[0] ?? null;
}

/** Legacy view of one source */
function asExcelData(source: ExcelSource | null): ExcelData | null {
  return source
    ? { columns: source.columns, rows: source.rows, fileName: source.label }
    : null;
}

/** Flatten libraries into the legacy photo list */
function flattenLibraries(libraries: PhotoLibrary[]): PhotoRecord[] {
  return libraries.flatMap((library) => library.photos);
}

/**
 * Owns imported data sources, photo libraries, column mappings and validation.
 * Sources are generated one at a time, so two classes may reuse a row index
 * and a photo name without colliding.
 */
export const useDataStore = create<DataState>()((set, get) => ({
  sources: [],
  activeSourceId: null,
  excelData: null,
  isParsing: false,
  parseError: null,

  photoLibraries: [],
  photoSourceMap: {},
  photos: [],
  isLoadingPhotos: false,
  photoZipProgress: null,
  photoError: null,
  photoMatchConfig: { mode: 'filename' },
  photoMatchResult: null,
  photoMatchBySource: {},

  mappings: {},
  validation: null,

  importSpreadsheets: async (files) => {
    const all = Array.from(files);
    const incoming = all.filter(isSupportedSpreadsheet);
    if (incoming.length === 0) {
      set({ parseError: 'No supported spreadsheets found (.xlsx, .xls, .csv).' });
      return;
    }
    set({ isParsing: true, parseError: null });
    try {
      const added: ExcelSource[] = [];
      const failures: string[] = [];
      let reference: ExcelSource | null =
        get().sources.find((source) => !source.error) ?? null;

      for (const file of incoming) {
        let parsed: ExcelSource[];
        try {
          parsed = await parseExcelSources(file);
        } catch (error) {
          // One unreadable file must not discard the other selected files.
          failures.push(error instanceof Error ? error.message : `Could not read ${file.name}.`);
          continue;
        }
        for (const source of parsed) {
          if (!reference) {
            reference = source;
            added.push(source);
            continue;
          }
          if (source.signature === reference.signature) {
            added.push(alignSourceColumns(source, reference));
          } else {
            // Column mismatch: keep the source visible with the reason, but
            // never generate from it (or from anything else) until removed.
            added.push({
              ...source,
              error: `Columns in "${source.label}" do not match "${reference.label}". Remove this file to continue.`,
            });
          }
        }
      }

      const sources = [...get().sources, ...added];
      const firstValid = added.find((source) => !source.error);
      set({
        sources,
        activeSourceId: firstValid?.id ?? get().activeSourceId ?? sources[0]?.id ?? null,
        isParsing: false,
        parseError: failures.length > 0 ? failures.join(' ') : null,
      });

      // Smart-map any library whose name matches a newly added source.
      if (firstValid) {
        const { photoLibraries, photoSourceMap } = get();
        const suggested = autoMapLibraries(sources, photoLibraries);
        const merged = { ...photoSourceMap };
        for (const [sourceId, libraryId] of Object.entries(suggested)) {
          if (!merged[sourceId]) merged[sourceId] = libraryId;
        }
        set({ photoSourceMap: merged });
      }

      // Only seed mappings on the first import; adding another class's file
      // must not wipe mappings the user already reviewed.
      if (Object.keys(get().mappings).length === 0) get().autoMapColumns();
      get().revalidate();
    } catch (error) {
      set({
        isParsing: false,
        parseError: error instanceof Error ? error.message : 'Unknown parsing error',
      });
    }
  },

  loadExcel: async (file) => {
    await get().importSpreadsheets([file]);
  },

  removeSource: (sourceId) => {
    const remaining = get().sources.filter((source) => source.id !== sourceId);
    // The first remaining source defines the column baseline again, so a file
    // that was blocked only because of the removed file becomes usable.
    // Prefer a source that was already valid, so removing the old baseline
    // cannot turn a working file into the new mismatch.
    const reference = remaining.find((source) => !source.error) ?? remaining[0];
    const sources = remaining.map((source) => {
      if (!reference) return source;
      if (source.id === reference.id || source.signature === reference.signature) {
        const { error: _error, ...rest } = source;
        return rest;
      }
      return {
        ...source,
        error: `Columns in "${source.label}" do not match "${reference.label}". Remove this file to continue.`,
      };
    });
    const photoSourceMap = { ...get().photoSourceMap };
    delete photoSourceMap[sourceId];
    const manualAssignments = { ...(get().photoMatchConfig.manualAssignments ?? {}) };
    for (const key of Object.keys(manualAssignments)) {
      if (key.startsWith(`${sourceId}::`)) delete manualAssignments[key];
    }
    const activeSourceId =
      get().activeSourceId === sourceId
        ? (resolveActive(sources, null)?.id ?? null)
        : get().activeSourceId;
    set({
      sources,
      activeSourceId,
      excelData: asExcelData(resolveActive(sources, activeSourceId)),
      photoSourceMap,
      photoMatchConfig: { ...get().photoMatchConfig, manualAssignments },
      parseError: null,
    });
    get().revalidate();
  },

  setActiveSource: (sourceId) => {
    const source = get().sources.find((candidate) => candidate.id === sourceId);
    if (!source) return;
    set({ activeSourceId: sourceId, excelData: asExcelData(source) });
    get().revalidate();
  },

  clearExcel: () => {
    set({
      sources: [],
      activeSourceId: null,
      excelData: null,
      mappings: {},
      validation: null,
      parseError: null,
      photoSourceMap: {},
      photoMatchBySource: {},
      photoMatchResult: null,
      // Manual picks belong to removed sources; don't keep stale row keys.
      photoMatchConfig: { ...get().photoMatchConfig, manualAssignments: {} },
    });
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
      const libraries = get().photoLibraries;
      const existing = libraries.find((library) => library.kind === 'images');
      const libraryId = existing?.id ?? generateId();
      const loaded = await loadPhotosService(incoming, libraryId);
      const nextLibraries = existing
        ? libraries.map((library) =>
            library.id === existing.id
              ? { ...library, photos: [...library.photos, ...loaded] }
              : library
          )
        : [
            ...libraries,
            {
              id: libraryId,
              kind: 'images' as const,
              name: LOOSE_LIBRARY_NAME,
              photos: loaded,
            },
          ];
      set({
        photoLibraries: nextLibraries,
        photos: flattenLibraries(nextLibraries),
        isLoadingPhotos: false,
      });
      get().revalidate();
    } catch (error) {
      set({
        isLoadingPhotos: false,
        photoError: error instanceof Error ? error.message : 'Unknown photo import error',
      });
    }
  },

  loadPhotoInputs: async (files) => {
    const list = Array.from(files);
    const images = list.filter(isSupportedImage);
    const archives = list.filter(isZipFile);
    if (images.length > 0) await get().loadPhotos(images);
    for (const archive of archives) await get().importPhotoZip(archive);
  },

  importPhotoZip: async (file) => {
    set({ isLoadingPhotos: true, photoError: null, photoZipProgress: 0 });
    try {
      const library = await extractPhotoLibrary(file, (fraction) =>
        set({ photoZipProgress: fraction })
      );
      const libraries = [...get().photoLibraries, library];
      const photoSourceMap = { ...get().photoSourceMap };
      const suggested = autoMapLibraries(get().sources, libraries);
      for (const [sourceId, libraryId] of Object.entries(suggested)) {
        if (!photoSourceMap[sourceId]) photoSourceMap[sourceId] = libraryId;
      }
      set({
        photoLibraries: libraries,
        photos: flattenLibraries(libraries),
        photoSourceMap,
        isLoadingPhotos: false,
        photoZipProgress: null,
      });
      get().revalidate();
    } catch (error) {
      set({
        isLoadingPhotos: false,
        photoZipProgress: null,
        photoError: error instanceof Error ? error.message : 'Unknown ZIP import error',
      });
    }
  },

  mapPhotoLibrary: (sourceId, libraryId) => {
    const photoSourceMap = { ...get().photoSourceMap };
    if (libraryId.length === 0) {
      delete photoSourceMap[sourceId];
    } else {
      photoSourceMap[sourceId] = libraryId;
    }
    set({ photoSourceMap });
    get().revalidate();
  },

  removePhotoLibrary: (libraryId) => {
    const library = get().photoLibraries.find((candidate) => candidate.id === libraryId);
    if (library) disposePhotos(library.photos);
    const photoLibraries = get().photoLibraries.filter((candidate) => candidate.id !== libraryId);
    const photoSourceMap = { ...get().photoSourceMap };
    for (const [sourceId, mappedId] of Object.entries(photoSourceMap)) {
      if (mappedId === libraryId) delete photoSourceMap[sourceId];
    }
    set({
      photoLibraries,
      photos: flattenLibraries(photoLibraries),
      photoSourceMap,
    });
    get().revalidate();
  },

  removePhoto: (photoId) => {
    const library = get().photoLibraries.find((candidate) =>
      candidate.photos.some((photo) => photo.id === photoId)
    );
    if (!library) return;
    const photo = library.photos.find((candidate) => candidate.id === photoId);
    if (photo) disposePhotos([photo]);
    const photoLibraries = get().photoLibraries.map((candidate) =>
      candidate.id === library.id
        ? { ...candidate, photos: candidate.photos.filter((entry) => entry.id !== photoId) }
        : candidate
    );
    set({ photoLibraries, photos: flattenLibraries(photoLibraries) });
    get().revalidate();
  },

  clearPhotos: () => {
    disposePhotos(get().photos);
    set({
      photoLibraries: [],
      photos: [],
      photoSourceMap: {},
      photoMatchResult: null,
      photoMatchBySource: {},
    });
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

  assignPhotoManually: (rowKeyValue, photoId) => {
    const config = get().photoMatchConfig;
    if (config.mode !== 'manual') return;
    const manualAssignments = { ...(config.manualAssignments ?? {}) };
    if (photoId.length === 0) {
      delete manualAssignments[String(rowKeyValue)];
    } else {
      manualAssignments[String(rowKeyValue)] = photoId;
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
    const source = resolveActive(get().sources, get().activeSourceId);
    // The legacy single-sheet view is still honoured (tests and any caller
    // that seeds `excelData` directly).
    const columns = source?.columns ?? get().excelData?.columns ?? [];
    if (columns.length === 0) return;
    // Placeholder keys come from the PSD design's placeholder layers.
    const psdProject = usePsdStore.getState().project;
    const keys = psdProject.placeholders.map((placeholder) => placeholder.key);

    const synonymDictionary: Record<string, string[]> = {
      Name: ['empname', 'fullname', 'employee name', 'user', 'first name', 'last name'],
      ID: ['empid', 'serial', 'roll no', 'employee id'],
      Photo: ['image', 'picture', 'profile'],
    };

    const scoreMapping = (placeholder: string, column: string): number => {
      const phLower = placeholder.toLowerCase().trim();
      const colLower = column.toLowerCase().trim();
      if (phLower.length === 0 || colLower.length === 0) return 0;
      if (phLower === colLower) return 100;
      if (phLower.includes(colLower) || colLower.includes(phLower)) return 80;
      const synonyms = Object.entries(synonymDictionary).find(
        ([key]) => key.toLowerCase() === phLower
      )?.[1];
      if (synonyms?.some((synonym) => colLower === synonym.toLowerCase())) return 60;
      const phWords = phLower.split(/\s+/);
      const colWords = colLower.split(/\s+/);
      if (phWords.some((word) => colWords.includes(word))) return 40;
      return 0;
    };

    const mappings: Record<string, string> = {};
    for (const key of keys) {
      let bestColumn: string | null = null;
      let bestScore = 0;
      for (const column of columns) {
        const score = scoreMapping(key, column);
        if (score > bestScore) {
          bestScore = score;
          bestColumn = column;
        }
      }
      if (bestScore > 40 && bestColumn) {
        mappings[key] = bestColumn;
      }
    }
    set({ mappings });
    get().revalidate();
  },

  revalidate: () => {
    const {
      sources,
      activeSourceId,
      excelData,
      photos,
      mappings,
      photoLibraries,
      photoSourceMap,
      photoMatchConfig,
    } = get();
    if (sources.length === 0) {
      // Legacy path: one ExcelData seeded directly (no source list).
      if (!excelData) {
        set({ validation: null, photoMatchResult: null, photoMatchBySource: {}, excelData: null });
        return { valid: true, issues: [], validRowIndexes: [] };
      }
      const psd = usePsdStore.getState().project;
      const keys = psd.placeholders.map((placeholder) => placeholder.key);
      const list: ColumnMapping[] = keys.map((placeholder) => ({
        placeholder,
        column: mappings[placeholder] ?? '',
      }));
      const photoMatchResult = matchPhotos(excelData.rows, photos, photoMatchConfig);
      const validation = validateData(excelData, list, {
        requiredPlaceholders: keys,
        photoColumn:
          photoMatchConfig.mode === 'column' ? photoMatchConfig.columnName : undefined,
        photoBaseNames: new Set(photos.map((photo) => photo.baseName)),
      });
      set({ validation, photoMatchResult, photoMatchBySource: {}, excelData });
      return validation;
    }

    const psdProject = usePsdStore.getState().project;
    const placeholders = psdProject.placeholders.map((placeholder) => placeholder.key);
    const mappingList: ColumnMapping[] = placeholders.map((placeholder) => ({
      placeholder,
      column: mappings[placeholder] ?? '',
    }));

    const active = resolveActive(sources, activeSourceId);
    const photoMatchBySource: Record<string, PhotoMatchResult> = {};
    const validationBySource: Record<string, ValidationResult> = {};

    for (const source of sources) {
      if (source.error) continue;
      const mappedLibrary =
        photoLibraries.find((library) => library.id === photoSourceMap[source.id]) ??
        (photoLibraries.length === 1 ? photoLibraries[0] : undefined);
      const sourcePhotos = mappedLibrary?.photos ?? [];
      // Headers may differ only in case between files; resolve the chosen
      // photo column against THIS source's own spelling.
      const configuredColumn =
        photoMatchConfig.mode === 'column' ? photoMatchConfig.columnName : undefined;
      const resolvedColumn = configuredColumn
        ? (source.columns.find(
            (column) => column.toLowerCase() === configuredColumn.toLowerCase()
          ) ?? configuredColumn)
        : undefined;
      const sourceConfig =
        photoMatchConfig.mode === 'column'
          ? { ...photoMatchConfig, columnName: resolvedColumn }
          : photoMatchConfig;
      const photoMatch = matchPhotos(source.rows, sourcePhotos, sourceConfig);
      photoMatchBySource[source.id] = photoMatch;

      const options: ValidateOptions = {
        requiredPlaceholders: placeholders,
        photoColumn: resolvedColumn,
        photoBaseNames: new Set(sourcePhotos.map((photo) => photo.baseName)),
      };
      validationBySource[source.id] = validateData(
        { columns: source.columns, rows: source.rows, fileName: source.label },
        mappingList,
        options
      );
    }

    const activeId =
      active && !active.error ? active.id : (sources.find((source) => !source.error)?.id ?? null);
    const validation = activeId ? (validationBySource[activeId] ?? null) : null;

    // Keep the same ExcelData object while the source's rows are unchanged:
    // IdStudio revalidates when `excelData` changes, so a fresh object on
    // every call would loop forever (and re-render the whole wizard).
    const currentExcelData = get().excelData;
    const nextExcelData =
      currentExcelData && active && currentExcelData.rows === active.rows
        ? currentExcelData
        : asExcelData(active);

    set({
      photoMatchBySource,
      photoMatchResult: activeId ? (photoMatchBySource[activeId] ?? null) : null,
      validation,
      excelData: nextExcelData,
      activeSourceId: active?.id ?? null,
    });
    return validation ?? { valid: true, issues: [], validRowIndexes: [] };
  },

  clearAll: () => {
    disposePhotos(get().photos);
    set({
      sources: [],
      activeSourceId: null,
      excelData: null,
      isParsing: false,
      parseError: null,
      photoLibraries: [],
      photos: [],
      photoSourceMap: {},
      isLoadingPhotos: false,
      photoZipProgress: null,
      photoError: null,
      photoMatchResult: null,
      photoMatchBySource: {},
      mappings: {},
      validation: null,
    });
  },
}));

