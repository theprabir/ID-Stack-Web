/**
 * Editor tool definitions and canvas constants (Architecture.md).
 */
import type { CanvasElementType } from '@/types/template';

/** Tools available in the editor toolbar */
export type ToolType = 'select' | 'text' | 'image' | 'shape' | 'barcode' | 'placeholder' | 'pan';

/** Map tools to the element type they create */
export const TOOL_ELEMENT_TYPE: Partial<Record<ToolType, CanvasElementType>> = {
  text: 'text',
  image: 'image',
  shape: 'shape',
  barcode: 'barcode',
  placeholder: 'placeholder',
};

/** Default element styling at creation time */
export const ELEMENT_DEFAULTS = {
  fontFamily: 'Inter',
  fontSize: 12, // pt
  fontWeight: 'normal',
  textAlign: 'left' as const,
  fill: '#111111',
  stroke: '',
  strokeWidth: 0,
  shadow: {
    color: '#000000',
    blur: 4,
    offsetX: 2,
    offsetY: 2,
    enabled: false,
  },
};

/** Default CR80 card dimensions for new templates */
export const DEFAULT_CARD_WIDTH_MM = 85.6;
export const DEFAULT_CARD_HEIGHT_MM = 54;
