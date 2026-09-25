import { create } from 'zustand';
import type { CardTemplate, CanvasElement, TemplateSide } from '@/types/template';
import { sideKey } from '@/types/template';
import {
  createTemplate as createTemplateService,
  saveTemplate as saveTemplateService,
  loadTemplate as loadTemplateService,
} from '@/services/templateService';
import { upsertElement, removeElement } from '@/services/templateService';

/** Which card face is being edited */
export type SideType = 'front' | 'back';

interface TemplateState {
  currentTemplate: CardTemplate | null;
  currentSide: SideType;
  isModified: boolean;
  isLoading: boolean;

  /** Create a new blank template and make it current (not yet persisted). */
  createTemplate: (name: string, width?: number, height?: number) => void;
  /** Load a template from IndexedDB. */
  loadTemplate: (id: string) => Promise<void>;
  /** Persist the current template. */
  saveTemplate: () => Promise<void>;
  /** Switch the edited side. */
  switchSide: (side: SideType) => void;
  /** Update template name. */
  renameTemplate: (name: string) => void;
  /** Insert or update an element on the current side. */
  upsertElement: (element: CanvasElement) => void;
  /** Remove an element from the current side. */
  removeElement: (elementId: string) => void;
  /** Replace the whole current side (used by canvas sync). */
  replaceSide: (side: TemplateSide) => void;
  /** Update background of the current side. */
  setSideBackground: (color: string) => void;
}

/**
 * Owns the currently-edited template and its dirty flag.
 * History (undo/redo) lives in useHistory; this store holds state only.
 */
export const useTemplateStore = create<TemplateState>()((set, get) => ({
  currentTemplate: null,
  currentSide: 'front',
  isModified: false,
  isLoading: false,

  createTemplate: (name, width, height) => {
    const template = createTemplateService(name, width, height);
    set({ currentTemplate: template, currentSide: 'front', isModified: true });
  },

  loadTemplate: async (id) => {
    set({ isLoading: true });
    try {
      const template = await loadTemplateService(id);
      set({ currentTemplate: template, currentSide: 'front', isModified: false });
    } finally {
      set({ isLoading: false });
    }
  },

  saveTemplate: async () => {
    const template = get().currentTemplate;
    if (!template) return;
    await saveTemplateService(template);
    set({ isModified: false });
  },

  switchSide: (side) => set({ currentSide: side }),

  renameTemplate: (name) => {
    const template = get().currentTemplate;
    if (!template) return;
    set({ currentTemplate: { ...template, name }, isModified: true });
  },

  upsertElement: (element) => {
    const { currentTemplate, currentSide } = get();
    if (!currentTemplate) return;
    const side = currentTemplate[sideKey(currentSide)];
    const nextSide = upsertElement(side, element);
    set({
      currentTemplate: { ...currentTemplate, [sideKey(currentSide)]: nextSide },
      isModified: true,
    });
  },

  removeElement: (elementId) => {
    const { currentTemplate, currentSide } = get();
    if (!currentTemplate) return;
    const side = currentTemplate[sideKey(currentSide)];
    const nextSide = removeElement(side, elementId);
    set({
      currentTemplate: { ...currentTemplate, [sideKey(currentSide)]: nextSide },
      isModified: true,
    });
  },

  replaceSide: (side) => {
    const { currentTemplate, currentSide } = get();
    if (!currentTemplate) return;
    set({
      currentTemplate: { ...currentTemplate, [sideKey(currentSide)]: side },
      isModified: true,
    });
  },

  setSideBackground: (color) => {
    const { currentTemplate, currentSide } = get();
    if (!currentTemplate) return;
    const side = currentTemplate[sideKey(currentSide)];
    set({
      currentTemplate: {
        ...currentTemplate,
        [sideKey(currentSide)]: { ...side, backgroundColor: color },
      },
      isModified: true,
    });
  },
}));
