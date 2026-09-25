import type { CardTemplate, TemplateSummary, TemplateSide, CanvasElement } from '@/types/template';
import {
  saveTemplateRecord,
  loadTemplateRecord,
  deleteTemplateRecord,
  listTemplateRecords,
} from './storageService';
import { generateId } from '@/utils/id';
import { DEFAULT_CARD_WIDTH_MM, DEFAULT_CARD_HEIGHT_MM } from '@/constants/canvas';

/** Template schema version for migrations */
const TEMPLATE_VERSION = '1.0';

/**
 * Create an empty template side.
 * @param sideType - 'front' | 'back'
 * @param width - Canvas width in mm
 * @param height - Canvas height in mm
 * @returns An empty side with no elements
 */
export function createEmptySide(
  sideType: 'front' | 'back',
  width: number,
  height: number
): TemplateSide {
  return {
    sideType,
    canvasWidth: width,
    canvasHeight: height,
    backgroundColor: '#FFFFFF',
    elements: [],
  };
}

/**
 * Create a new blank CR80 dual-sided template.
 * @param name - Display name for the template
 * @param width - Card width in mm (default CR80 85.6)
 * @param height - Card height in mm (default CR80 54)
 * @returns The newly created template (not yet persisted)
 */
export function createTemplate(
  name: string,
  width = DEFAULT_CARD_WIDTH_MM,
  height = DEFAULT_CARD_HEIGHT_MM
): CardTemplate {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    version: TEMPLATE_VERSION,
    createdDate: now,
    modifiedDate: now,
    frontSide: createEmptySide('front', width, height),
    backSide: createEmptySide('back', width, height),
    metadata: {},
  };
}

/**
 * Persist a template (insert or update).
 * @param template - The template to save
 */
export async function saveTemplate(template: CardTemplate): Promise<void> {
  const stamped: CardTemplate = { ...template, modifiedDate: new Date().toISOString() };
  await saveTemplateRecord({
    id: stamped.id,
    name: stamped.name,
    modifiedDate: stamped.modifiedDate,
    data: stamped,
  });
}

/**
 * Load a template by id.
 * @param id - Template id
 * @returns The template
 * @throws Error when the template does not exist
 */
export async function loadTemplate(id: string): Promise<CardTemplate> {
  const record = await loadTemplateRecord(id);
  if (!record) {
    throw new Error(`Template not found: ${id}`);
  }
  return record.data as CardTemplate;
}

/**
 * Delete a template by id.
 * @param id - Template id
 */
export async function deleteTemplate(id: string): Promise<void> {
  await deleteTemplateRecord(id);
}

/**
 * List all templates (summaries only).
 * @returns Summaries sorted newest-first
 */
export async function listTemplates(): Promise<TemplateSummary[]> {
  const records = await listTemplateRecords();
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    modifiedDate: record.modifiedDate,
  }));
}

/**
 * Duplicate a template under a new id.
 * @param template - Template to duplicate
 * @param newName - Name for the copy
 * @returns The duplicated template (persisted)
 */
export async function duplicateTemplate(
  template: CardTemplate,
  newName: string
): Promise<CardTemplate> {
  const copy: CardTemplate = {
    ...structuredClone(template),
    id: generateId(),
    name: newName,
    createdDate: new Date().toISOString(),
  };
  await saveTemplate(copy);
  return copy;
}

/**
 * Update or insert an element within a side.
 * @param side - The template side to modify (mutated copy returned)
 * @param element - The element to upsert
 * @returns A new side object with the element applied
 */
export function upsertElement(side: TemplateSide, element: CanvasElement): TemplateSide {
  const index = side.elements.findIndex((existing) => existing.id === element.id);
  const elements = [...side.elements];
  if (index >= 0) {
    elements[index] = element;
  } else {
    elements.push(element);
  }
  return { ...side, elements };
}

/**
 * Remove an element from a side.
 * @param side - The template side to modify
 * @param elementId - Id of the element to remove
 * @returns A new side object without the element
 */
export function removeElement(side: TemplateSide, elementId: string): TemplateSide {
  return { ...side, elements: side.elements.filter((element) => element.id !== elementId) };
}
