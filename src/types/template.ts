/**
 * Core template data model (Architecture.md — template.ts).
 * Canvas geometry is stored in millimetres.
 */

/** Shadow configuration for any element */
export interface ShadowConfig {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  enabled: boolean;
}

/** Image crop configuration */
export interface CropConfig {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Element types available in the editor */
export type CanvasElementType = 'text' | 'image' | 'shape' | 'barcode' | 'placeholder';

/** Shape sub-types for the shape tool */
export type ShapeKind = 'rect' | 'circle' | 'line' | 'polygon';

/** Fill configuration: solid, gradient or none */
export interface FillConfig {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'none';
  color?: string;
  color2?: string;
  angle?: number;
}

/** A single design element on a template side */
export interface CanvasElement {
  id: string;
  name: string;
  type: CanvasElementType;
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
  rotation: number; // degrees
  opacity: number; // 0-1
  locked: boolean;
  visible: boolean;
  zIndex: number;

  /** Shape kind when type === 'shape' */
  shapeKind?: ShapeKind;

  // Appearance
  fill?: FillConfig;
  stroke?: string;
  strokeWidth?: number;
  strokeDashArray?: number[];
  shadow?: ShadowConfig;
  cornerRadius?: number;

  // Text-specific
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  underline?: boolean;
  lineHeight?: number;
  charSpacing?: number;

  // Image-specific
  imageSrc?: string;
  crop?: CropConfig;

  // Placeholder-specific
  columnName?: string;
  defaultValue?: string;

  // Barcode-specific
  barcodeType?: 'qrcode' | 'code128' | 'code39' | 'ean13' | 'upca';
  barcodeData?: string;
}

/** One side of a card (front or back) */
export interface TemplateSide {
  sideType: 'front' | 'back';
  canvasWidth: number; // mm
  canvasHeight: number; // mm
  backgroundColor: string;
  backgroundImage?: string;
  elements: CanvasElement[];
}

/** Data source binding configuration (Excel import, Phase 3) */
export interface DataSourceConfig {
  fileName?: string;
  mappings?: Record<string, string>;
}

/** A complete dual-sided card template */
export interface CardTemplate {
  id: string;
  name: string;
  version: string;
  createdDate: string;
  modifiedDate: string;
  frontSide: TemplateSide;
  backSide: TemplateSide;
  dataSource?: DataSourceConfig;
  metadata: Record<string, string>;
}

/** Lightweight template info for lists */
export interface TemplateSummary {
  id: string;
  name: string;
  modifiedDate: string;
}

/** Helper: index a CardTemplate by side string */
export type SideOf<T extends 'front' | 'back'> = T extends 'front'
  ? CardTemplate['frontSide']
  : CardTemplate['backSide'];

/** Safe side accessor name for indexing CardTemplate */
export type SideKey = 'frontSide' | 'backSide';

/** Get the side key for a side type */
export function sideKey(side: 'front' | 'back'): SideKey {
  return side === 'front' ? 'frontSide' : 'backSide';
}
