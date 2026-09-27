/**
 * PSD-first pipeline types.
 * A PSD design is the source of truth: layers are detected, the user marks
 * text/photo layers as placeholders, and batch generation re-renders the
 * design with per-row content while leaving every other layer untouched.
 */
import type { ExcelData, PhotoMatchResult } from './data';

/** Which face of the card a design/layer belongs to */
export type SideType = 'front' | 'back';

/** Side key helper (avoids string-literal drift) */
export function sideKeyOf(side: SideType): 'front' | 'back' {
  return side;
}

/** Layer categories we can detect */
export type PsdLayerKind = 'text' | 'image' | 'group' | 'shape' | 'other';

/** Role the user assigns to a chosen placeholder layer */
export type PlaceholderRole = 'text' | 'photo';

/** Stroke position relative to the layer edge (Photoshop semantics) */
export type PsdStrokePosition = 'inside' | 'center' | 'outside';

/** Normalised Photoshop layer effects kept for faithful re-rendering */
export interface PsdLayerEffects {
  /** Outer drop shadows (angle in degrees, distance/blur in layer pixels) */
  dropShadows?: {
    color: string;
    opacity: number;
    angle: number;
    distance: number;
    blur: number;
  }[];
  /** Inner shadows (same units as drop shadows) */
  innerShadows?: {
    color: string;
    opacity: number;
    angle: number;
    distance: number;
    blur: number;
  }[];
  outerGlow?: { color: string; opacity: number; blur: number };
  innerGlow?: { color: string; opacity: number; blur: number };
  stroke?: {
    color: string;
    width: number;
    position: PsdStrokePosition;
    opacity: number;
  };
  /** Colour overlay (Photoshop solidFill effect) — replaces the fill colour */
  solidFill?: { color: string; opacity: number };
}

/**
 * Mask bitmap for a layer (grayscale: white = show, black = hide). Stored as
 * a canvas covering the mask's own bounds; the layer's mask offset maps it
 * back into design space at render time.
 */
export interface PsdLayerMask {
  canvas: HTMLCanvasElement;
  /** Mask top/left in design pixels */
  top: number;
  left: number;
}

/** The render-time style oracle measured from the layer's ORIGINAL raster */
export interface PsdTextStyleOracle {
  /** Calibrated font size in design px (matches the raster ink height) */
  fontSize: number;
  /** Weight variant matched from the raster's ink density */
  bold: boolean;
  /** Slant variant matched from the raster's centroid drift */
  italic: boolean;
  /** Fill colour measured from the raster's solid pixels */
  color?: string;
  /**
   * The original text's ink box in DESIGN pixel coordinates (absolute, not
   * layer-relative): where the original string actually sat inside the
   * layer bounds. Substituted text is anchored to the same left/baseline
   * position so replacement values land exactly where the sample was.
   */
  inkBox: { left: number; top: number; right: number; bottom: number };
  /**
   * Distance from the ORIGINAL string's ink-box top to its first BASELINE
   * (design px). The ink-box top alone cannot anchor a baseline: a
   * descender-less sample ("ID") has no ink below the baseline, so aligning
   * the substituted ink top to the original ink top would push the baseline
   * too LOW. This offset (raster + font metrics, measured at parse time)
   * reproduces Photoshop's true baseline for any substituted value.
   */
  baselineOffset?: number;
  /**
   * Horizontal offset from the text path origin to the original ink-box
   * LEFT edge (design px). Substituted text starts at origin + this offset
   * (left-justified text), matching where the sample actually started.
   */
  originOffsetX?: number;
}

/** A flattened layer description extracted from a parsed PSD.
 * Bounds are in PSD pixel space; styling preserves the design exactly.
 */
export interface PsdLayerInfo {
  /** Stable id derived from the layer path (e.g. "front/Name") */
  id: string;
  /** Layer name as authored in Photoshop */
  name: string;
  /** Nesting path (ancestor group names) for display + disambiguation */
  path: string[];
  kind: PsdLayerKind;
  /** Whether the layer is visible in the PSD */
  hidden: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
  opacity: number;
  blendMode: string;
  /** Text content + full style for text layers */
  text?: {
    content: string;
    /** Font size in DESIGN px (engine size × text-transform scale) */
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** Tracking in DESIGN px per gap (engine tracking = thousandths of em) */
    tracking?: number;
    /** Baseline-to-baseline spacing in DESIGN px (auto-leading resolved) */
    leading?: number;
    /** True when the PSD used auto-leading (leading = 1.2 × fontSize) */
    autoLeading?: boolean;
    justification?: string;
    /**
     * Photoshop text shape: 'point' (no width wrapping, explicit newlines
     * only, ink can extend freely) or 'box' (wraps at the box width).
     * Defaults to 'point' when the engine data omits it.
     */
    shapeType?: 'point' | 'box';
    /** Text box width in design px (box text only; 0 = unknown) */
    boxWidth?: number;
    /** Text box height in design px (box text only; 0 = unknown) */
    boxHeight?: number;
    /**
     * Text-path origin in design px (engine-data transform tx/ty): where
     * the text's first baseline starts. Box text is top-left anchored at
     * the box, point text is baseline-anchored here.
     */
    originX?: number;
    originY?: number;
    /**
     * RENDER-TIME STYLE ORACLE — the style measured from this layer's
     * ORIGINAL rasterized pixels (size, weight, slant, colour). drawText
     * consults it so substituted text always matches the original raster
     * exactly, regardless of engine-data quirks or font fallback.
     */
    oracle?: PsdTextStyleOracle;
    /**
     * Resolved per-character style segments (font size/colour/weight/italic
     * in design px / CSS values). Derived from engine styleRuns at parse
     * time so the renderer never re-converts units.
     */
    runs?: PsdTextRun[];
    /** Engine text stroke colour (drawn under the fill when strokeFlag) */
    strokeColor?: string;
    /** Engine text stroke width in design px (engine outlineWidth) */
    strokeWidth?: number;
  };
  /** True when the layer has pixel content (raster/vector rendered by ag-psd) */
  hasPixels: boolean;
  /** True when the layer has non-default effects (shadow/glow/stroke) */
  hasEffects: boolean;
  /** Normalised effects (stroke/shadow/glow/overlay) for faithful re-render */
  effects?: PsdLayerEffects;
  /** Layer/vector mask bitmap (clips re-rendered placeholder content) */
  maskCanvas?: HTMLCanvasElement;
  /** Mask bitmap's top/left position in design pixels (may differ from bounds) */
  maskOffset?: { top: number; left: number };
  /** True when this layer is a clipping base for layers above (Photoshop clipping mask) */
  clipped: boolean;
  /** Number of child layers (groups only) */
  childCount: number;
}

/** One per-character style segment resolved to renderer-ready values */
export interface PsdTextRun {
  /** First character index (0-based, inclusive) */
  from: number;
  /** End character index (exclusive) */
  to: number;
  /** Font size in design px */
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Tracking in design px per gap */
  tracking?: number;
}

/** A user-chosen placeholder layer on one side */
export interface PsdPlaceholder {
  /** PsdLayerInfo.id */
  layerId: string;
  /** Layer display name */
  layerName: string;
  role: PlaceholderRole;
  side: SideType;
  /** Placeholder key used for Excel mapping (defaults to layer name) */
  key: string;
}

/** Parsed PSD for one card face */
export interface PsdDesign {
  fileName: string;
  width: number;
  height: number;
  /**
   * Design resolution in pixels per inch (from the PSD's ResolutionInfo).
   * Everything physical — card trim size, font point sizes, effect
   * distances — derives from px ÷ DPI × 72. Falls back to 72 (screen
   * resolution, 1 px = 1 pt) when the PSD does not declare one.
   */
  horizontalResolution: number;
  /** Flattened layer list, bottom-most first (Photoshop file order) */
  layers: PsdLayerInfo[];
  /** Flattened visible composite of the design (blob URL) */
  compositeUrl: string;
  /** Layer rasters keyed by layer id (blob URLs, kept for preview/generation) */
  layerRasters: Record<string, string>;
}

/** Complete dual-sided PSD project */
export interface PsdProject {
  front: PsdDesign | null;
  back: PsdDesign | null;
  placeholders: PsdPlaceholder[];
}

/** State serialisable into IndexedDB (blob URLs replaced by buffers) */
export interface StoredPsdProject {
  id: string;
  name: string;
  createdDate: string;
  modifiedDate: string;
  /** Raw PSD bytes for re-parsing on load */
  frontPsd?: ArrayBuffer;
  backPsd?: ArrayBuffer;
  placeholders: PsdPlaceholder[];
  dataSource?: {
    fileName?: string;
    mappings?: Record<string, string>;
  };
}

/** Placeholder keys derived from a project (union of placeholder keys) */
export function collectPlaceholderKeys(placeholders: PsdPlaceholder[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const placeholder of placeholders) {
    if (placeholder.key && !seen.has(placeholder.key)) {
      seen.add(placeholder.key);
      keys.push(placeholder.key);
    }
  }
  return keys;
}

/** Row inputs for generating one card */
export interface CardRenderInput {
  row: ExcelData['rows'][number];
  photos: PhotoMatchResult['assignments'];
}
