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

/**
 * A flattened layer description extracted from a parsed PSD.
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
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    tracking?: number;
    leading?: number;
    justification?: string;
    /** Complete run list so mixed-style text can be re-rendered faithfully */
    styleRuns?: { from: number; to: number; style: Record<string, unknown> }[];
  };
  /** True when the layer has pixel content (raster/vector rendered by ag-psd) */
  hasPixels: boolean;
  /** True when the layer has non-default effects (shadow/glow/stroke) */
  hasEffects: boolean;
  /** Number of child layers (groups only) */
  childCount: number;
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
  /** Flattened layer tree (top-most first, as in Photoshop) */
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
