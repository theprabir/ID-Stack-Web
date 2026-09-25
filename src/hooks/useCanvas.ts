import { useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import type { CanvasElement, CardTemplate, TemplateSide } from '@/types/template';
import { sideKey } from '@/types/template';
import { useTemplateStore } from '@/stores/templateStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { mmToPx, pxToMm } from '@/utils/units';
import { generateId } from '@/utils/id';
import { ELEMENT_DEFAULTS } from '@/constants/canvas';

export interface UseCanvasResult {
  /** Attach to a canvas element ref (call via ref callback). */
  attachCanvas: (htmlCanvas: HTMLCanvasElement | null) => void;
  /** Render a full template side onto the canvas. */
  loadSide: (side: TemplateSide) => Promise<void>;
  /** Serialise the canvas back into a TemplateSide. */
  exportSide: () => TemplateSide;
  /** Create an element of the given serialised data on the canvas. */
  addElementFromData: (element: CanvasElement) => void;
  /** Delete the currently selected objects. */
  deleteSelected: () => void;
  /** Bring selected to front / send to back. */
  bringToFront: () => void;
  sendToBack: () => void;
  /** Step-wise ordering (Ctrl+] / Ctrl+[). */
  bringForward: () => void;
  sendBackward: () => void;
  /** Select all / deselect (Ctrl+A / Ctrl+D). */
  selectAll: () => void;
  deselectAll: () => void;
  /** Nudge selected objects by pixel deltas (arrow keys). */
  nudgeSelected: (dx: number, dy: number) => void;
  /** Reorder an element to a stack index (drag-drop layers). */
  reorderElement: (elementId: string, toIndex: number) => void;
}

/** Fabric object → CanvasElement serialisation */
function serializeObject(object: fabric.FabricObject, index: number): CanvasElement {
  const elementType = (object as FabricObjectWithElement).elementType ?? 'shape';
  const base: CanvasElement = {
    id: (object as FabricObjectWithElement).elementId ?? generateId(),
    name: (object as unknown as { name?: string }).name ?? elementType,
    type: elementType,
    x: pxToMm(object.left ?? 0),
    y: pxToMm(object.top ?? 0),
    width: pxToMm(object.getScaledWidth()),
    height: pxToMm(object.getScaledHeight()),
    rotation: object.angle ?? 0,
    opacity: object.opacity ?? 1,
    locked: !object.selectable,
    visible: object.visible,
    zIndex: index,
    fill: { type: 'solid', color: typeof object.fill === 'string' ? object.fill : '#000000' },
    stroke: typeof object.stroke === 'string' ? object.stroke : undefined,
    strokeWidth: object.strokeWidth && object.strokeWidth > 0 ? object.strokeWidth : undefined,
  };

  if (elementType === 'text' || elementType === 'placeholder') {
    const text = object as fabric.Textbox;
    base.text = text.text;
    base.fontFamily = text.fontFamily;
    base.fontSize = text.fontSize;
    base.fontWeight = String(text.fontWeight);
    base.fontStyle = text.fontStyle;
    base.textAlign = (text.textAlign as CanvasElement['textAlign']) ?? 'left';
    base.underline = text.underline;
    base.lineHeight = text.lineHeight;
    base.charSpacing = text.charSpacing;
  }
  if (elementType === 'placeholder') {
    base.columnName = (object as FabricObjectWithElement).columnName;
    base.defaultValue = (object as FabricObjectWithElement).defaultValue;
  }
  if (elementType === 'barcode') {
    base.barcodeType = (object as FabricObjectWithElement).barcodeType;
    base.barcodeData = (object as FabricObjectWithElement).barcodeData;
  }

  return base;
}

/** Extended Fabric object carrying our element metadata */
interface FabricObjectWithElement {
  elementId?: string;
  elementType?: CanvasElement['type'];
  columnName?: string;
  defaultValue?: string;
  barcodeType?: CanvasElement['barcodeType'];
  barcodeData?: string;
}

/** Convert a CanvasElement to a Fabric object */
async function deserializeElement(element: CanvasElement): Promise<fabric.FabricObject | null> {
  const mm = mmToPx;
  const common: Record<string, unknown> = {
    left: mm(element.x),
    top: mm(element.y),
    angle: element.rotation,
    opacity: element.opacity,
    visible: element.visible,
    selectable: !element.locked,
    evented: !element.locked,
    stroke: element.stroke || undefined,
    strokeWidth: element.strokeWidth ?? 0,
    strokeDashArray: element.strokeDashArray,
  };

  switch (element.type) {
    case 'text': {
      return new fabric.Textbox(element.text ?? 'Text', {
        ...common,
        width: mm(element.width),
        fontFamily: element.fontFamily ?? ELEMENT_DEFAULTS.fontFamily,
        fontSize: element.fontSize ?? ELEMENT_DEFAULTS.fontSize,
        fontWeight: element.fontWeight ?? 'normal',
        fontStyle: element.fontStyle ?? 'normal',
        textAlign: element.textAlign ?? 'left',
        underline: element.underline ?? false,
        fill: element.fill?.color ?? ELEMENT_DEFAULTS.fill,
        splitByGrapheme: false,
      });
    }
    case 'placeholder': {
      const label = element.columnName
        ? `{{${element.columnName}}}`
        : (element.text ?? '{{Field}}');
      const textbox = new fabric.Textbox(label, {
        ...common,
        width: mm(element.width),
        fontFamily: element.fontFamily ?? ELEMENT_DEFAULTS.fontFamily,
        fontSize: element.fontSize ?? ELEMENT_DEFAULTS.fontSize,
        fill: element.fill?.color ?? '#2563EB',
        strokeDashArray: [4, 3],
      });
      (textbox as fabric.FabricObject & Partial<FabricObjectWithElement>).elementType =
        'placeholder';
      (textbox as fabric.FabricObject & Partial<FabricObjectWithElement>).columnName =
        element.columnName;
      (textbox as fabric.FabricObject & Partial<FabricObjectWithElement>).defaultValue =
        element.defaultValue;
      return textbox;
    }
    case 'image': {
      if (!element.imageSrc) return null;
      const image = await fabric.FabricImage.fromURL(element.imageSrc, {
        crossOrigin: 'anonymous',
      });
      image.set({
        ...common,
        scaleX: mm(element.width) / (image.width ?? 1),
        scaleY: mm(element.height) / (image.height ?? 1),
      });
      return image;
    }
    case 'barcode': {
      // Barcode rendering (QR + 1D) lands with the data-import phase wiring;
      // for now barcodes are represented as labelled boxes.
      const box = new fabric.Rect({
        ...common,
        width: mm(element.width),
        height: mm(element.height),
        fill: '#FFFFFF',
        stroke: '#333333',
        strokeWidth: 1,
      });
      (box as fabric.FabricObject & Partial<FabricObjectWithElement>).elementType = 'barcode';
      (box as fabric.FabricObject & Partial<FabricObjectWithElement>).barcodeType =
        element.barcodeType;
      (box as fabric.FabricObject & Partial<FabricObjectWithElement>).barcodeData =
        element.barcodeData;
      return box;
    }
    case 'shape':
    default: {
      const rect = new fabric.Rect({
        ...common,
        width: mm(element.width),
        height: mm(element.height),
        fill: element.fill?.type === 'none' ? undefined : (element.fill?.color ?? '#CCCCCC'),
        rx: element.cornerRadius ? mm(element.cornerRadius) : 0,
        ry: element.cornerRadius ? mm(element.cornerRadius) : 0,
      });
      return rect;
    }
  }
}

/**
 * Fabric.js bridge hook: keeps the canvas and templateStore in sync,
 * handles tool creation, selection → canvasStore, zoom/pan and history pushes.
 */
export function useCanvas(
  onChange: (template: CardTemplate, label: string) => void
): UseCanvasResult {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 600, height: 360 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const currentTemplate = useTemplateStore((state) => state.currentTemplate);
  const currentSide = useTemplateStore((state) => state.currentSide);
  const replaceSide = useTemplateStore((state) => state.replaceSide);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const selectMultiple = useCanvasStore((state) => state.selectMultiple);
  const clearSelection = useCanvasStore((state) => state.clearSelection);

  /** Serialise the whole canvas into a TemplateSide. */
  const exportSide = useCallback((): TemplateSide => {
    const canvas = canvasRef.current;
    const template = useTemplateStore.getState().currentTemplate;
    const side = useTemplateStore.getState().currentSide;
    if (!canvas || !template) {
      return template
        ? template[sideKey(side)]
        : {
            sideType: 'front',
            canvasWidth: 0,
            canvasHeight: 0,
            backgroundColor: '#FFFFFF',
            elements: [],
          };
    }
    const elements = canvas.getObjects().map((object, index) => serializeObject(object, index));
    return {
      ...template[sideKey(side)],
      backgroundColor: (canvas.backgroundColor as string) ?? '#FFFFFF',
      elements,
    };
  }, []);

  /** Commit canvas → store + history. */
  const commit = useCallback(
    (label: string) => {
      const template = useTemplateStore.getState().currentTemplate;
      if (!template) return;
      const side = useTemplateStore.getState().currentSide;
      const nextSide = exportSide();
      const nextSideKey = sideKey(side);
      const next: CardTemplate = { ...template, [nextSideKey]: nextSide };
      replaceSide(nextSide);
      onChangeRef.current(next, label);
    },
    [exportSide, replaceSide]
  );

  /** Attach Fabric to the DOM canvas (used as a ref callback). */
  const attachCanvas = useCallback(
    (htmlCanvas: HTMLCanvasElement | null) => {
      if (!htmlCanvas) return;
      if (canvasRef.current) return; // already attached

      const side = useTemplateStore.getState().currentTemplate?.frontSide;
      const widthMm = side?.canvasWidth ?? 85.6;
      const heightMm = side?.canvasHeight ?? 54;

      const canvas = new fabric.Canvas(htmlCanvas, {
        width: mmToPx(widthMm),
        height: mmToPx(heightMm),
        backgroundColor: side?.backgroundColor ?? '#FFFFFF',
        selection: true,
        preserveObjectStacking: true,
      });
      canvasRef.current = canvas;
      containerSizeRef.current = { width: mmToPx(widthMm), height: mmToPx(heightMm) };

      // Selection sync
      canvas.on('selection:created', (event) => {
        const ids =
          event.selected?.map((object) => (object as FabricObjectWithElement).elementId ?? '') ??
          [];
        if (ids.length > 0) selectMultiple(ids.filter(Boolean));
      });
      canvas.on('selection:updated', (event) => {
        const ids =
          event.selected?.map((object) => (object as FabricObjectWithElement).elementId ?? '') ??
          [];
        if (ids.length > 0) selectMultiple(ids.filter(Boolean));
      });
      canvas.on('selection:cleared', () => clearSelection());

      // Modification commits (moved/scaled/rotated)
      const commitModification = (): void => commit('modify');
      canvas.on('object:modified', commitModification);

      // Wheel zoom with Ctrl, plain scroll pans vertically
      canvas.on('mouse:wheel', (event) => {
        const delta = event.e.deltaY;
        const zoomFactor = delta > 0 ? 0.9 : 1.1;
        const nextZoom = Math.min(4, Math.max(0.1, (canvas.getZoom() ?? 1) * zoomFactor));
        canvas.setZoom(nextZoom);
        setZoom(nextZoom);
        event.e.preventDefault();
        event.e.stopPropagation();
      });

      // Pan with Alt+drag (space-drag handled at window level in CanvasEditor)
      let isPanning = false;
      let lastPanX = 0;
      let lastPanY = 0;
      canvas.on('mouse:down', (event) => {
        if (event.e.altKey) {
          isPanning = true;
          const pointer = event.e as PointerEvent;
          lastPanX = pointer.clientX;
          lastPanY = pointer.clientY;
          canvas.selection = false;
        }
      });
      canvas.on('mouse:move', (event) => {
        if (isPanning) {
          const viewport = canvas.viewportTransform;
          if (viewport) {
            const pointer = event.e as PointerEvent;
            viewport[4] += pointer.clientX - lastPanX;
            viewport[5] += pointer.clientY - lastPanY;
            canvas.requestRenderAll();
          }
          const pointer = event.e as PointerEvent;
          lastPanX = pointer.clientX;
          lastPanY = pointer.clientY;
        }
      });
      canvas.on('mouse:up', () => {
        if (isPanning) {
          isPanning = false;
          canvas.selection = true;
        }
      });
    },
    [clearSelection, commit, selectMultiple, setZoom]
  );

  /** Re-attach-side whenever the edited side changes. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const template = currentTemplate;
    if (!canvas || !template) return;
    const side = template[sideKey(currentSide)];
    void (async () => {
      canvas.clear();
      canvas.backgroundColor = side.backgroundColor;
      canvas.setDimensions({
        width: mmToPx(side.canvasWidth),
        height: mmToPx(side.canvasHeight),
      });
      for (const element of side.elements) {
        const object = await deserializeElement(element);
        if (object) {
          (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementId = element.id;
          (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementType =
            element.type;
          if (element.type === 'placeholder') {
            (object as fabric.FabricObject & Partial<FabricObjectWithElement>).columnName =
              element.columnName;
            (object as fabric.FabricObject & Partial<FabricObjectWithElement>).defaultValue =
              element.defaultValue;
          }
          canvas.add(object);
        }
      }
      canvas.requestRenderAll();
    })();
  }, [currentTemplate?.id, currentSide, currentTemplate === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Load a side explicitly (e.g. after undo/redo). */
  const loadSide = useCallback(async (side: TemplateSide): Promise<void> => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = side.backgroundColor;
    canvas.setDimensions({ width: mmToPx(side.canvasWidth), height: mmToPx(side.canvasHeight) });
    for (const element of side.elements) {
      const object = await deserializeElement(element);
      if (object) {
        (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementId = element.id;
        (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementType =
          element.type;
        canvas.add(object);
      }
    }
    canvas.requestRenderAll();
  }, []);

  /** Add a fully-specified element (from toolbar) onto the canvas. */
  const addElementFromData = useCallback(
    (element: CanvasElement): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      void (async () => {
        const object = await deserializeElement(element);
        if (!object) return;
        (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementId = element.id;
        (object as fabric.FabricObject & Partial<FabricObjectWithElement>).elementType =
          element.type;
        if (element.type === 'placeholder') {
          (object as fabric.FabricObject & Partial<FabricObjectWithElement>).columnName =
            element.columnName;
          (object as fabric.FabricObject & Partial<FabricObjectWithElement>).defaultValue =
            element.defaultValue;
        }
        canvas.setActiveObject(object);
        canvas.add(object);
        canvas.requestRenderAll();
        commit(`add ${element.type}`);
      })();
    },
    [commit]
  );

  const deleteSelected = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selected = canvas.getActiveObjects();
    if (selected.length === 0) return;
    selected.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    commit('delete');
  }, [commit]);

  const bringToFront = useCallback((): void => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.bringObjectToFront(active);
    canvas.requestRenderAll();
    commit('bring to front');
  }, [commit]);

  const sendToBack = useCallback((): void => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.sendObjectToBack(active);
    canvas.requestRenderAll();
    commit('send to back');
  }, [commit]);

  /** Bring selected object one step forward (Ctrl+]). */
  const bringForward = useCallback((): void => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.bringObjectForward(active);
    canvas.requestRenderAll();
    commit('bring forward');
  }, [commit]);

  /** Send selected object one step backward (Ctrl+[). */
  const sendBackward = useCallback((): void => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.sendObjectBackwards(active);
    canvas.requestRenderAll();
    commit('send backward');
  }, [commit]);

  /** Select all objects on the canvas (Ctrl+A). */
  const selectAll = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects().filter((object) => object.selectable);
    if (objects.length === 0) return;
    const activeSelection = new fabric.ActiveSelection(objects, { canvas });
    canvas.setActiveObject(activeSelection);
    canvas.requestRenderAll();
  }, []);

  /** Deselect everything (Ctrl+D / Esc). */
  const deselectAll = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  /** Nudge selected objects by dx/dy pixels (arrow keys). */
  const nudgeSelected = useCallback(
    (dx: number, dy: number): void => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
      active.setCoords();
      canvas.requestRenderAll();
      commit('move');
    },
    [commit]
  );

  /** Reorder an element by moving it to a specific stack index (drag-drop layers). */
  const reorderElement = useCallback(
    (elementId: string, toIndex: number): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const objects = canvas.getObjects();
      const fromIndex = objects.findIndex(
        (object) => (object as FabricObjectWithElement).elementId === elementId
      );
      if (fromIndex < 0) return;
      const object = objects[fromIndex];
      if (!object) return;
      canvas.moveObjectTo(object, toIndex);
      canvas.requestRenderAll();
      commit('reorder layer');
    },
    [commit]
  );

  /** Cleanup on unmount. */
  useEffect(() => {
    return () => {
      canvasRef.current?.dispose();
      canvasRef.current = null;
    };
  }, []);

  /** Keep Fabric background in sync with store (background color edits). */
  useEffect(() => {
    const canvas = canvasRef.current;
    const template = currentTemplate;
    if (!canvas || !template) return;
    const color = template[sideKey(currentSide)].backgroundColor;
    if (canvas.backgroundColor !== color) {
      canvas.backgroundColor = color;
      canvas.requestRenderAll();
    }
  }, [currentTemplate, currentSide]);

  return {
    attachCanvas,
    loadSide,
    exportSide,
    addElementFromData,
    deleteSelected,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    selectAll,
    deselectAll,
    nudgeSelected,
    reorderElement,
  };
}
