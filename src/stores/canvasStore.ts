import { create } from 'zustand';
import type { ToolType } from '@/constants/canvas';
import { MIN_ZOOM, MAX_ZOOM } from '@/constants/units';

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedElementIds: string[];
  currentTool: ToolType;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  selectElement: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  setTool: (tool: ToolType) => void;
}

/**
 * Viewport and interaction state for the Fabric.js canvas.
 */
export const useCanvasStore = create<CanvasState>()((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedElementIds: [],
  currentTool: 'select',

  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),

  zoomIn: () => {
    const { zoom, setZoom } = get();
    setZoom(Math.round((zoom + 0.1) * 10) / 10);
  },

  zoomOut: () => {
    const { zoom, setZoom } = get();
    setZoom(Math.round((zoom - 0.1) * 10) / 10);
  },

  resetZoom: () => set({ zoom: 1 }),

  setPan: (panX, panY) => set({ panX, panY }),

  selectElement: (id) => set({ selectedElementIds: [id] }),

  selectMultiple: (ids) => set({ selectedElementIds: ids }),

  clearSelection: () => set({ selectedElementIds: [] }),

  setTool: (tool) => set({ currentTool: tool }),
}));
