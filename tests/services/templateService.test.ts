import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTemplate,
  saveTemplate,
  loadTemplate,
  deleteTemplate,
  listTemplates,
  duplicateTemplate,
  createEmptySide,
  upsertElement,
  removeElement,
} from '@/services/templateService';
import { getDatabase } from '@/services/storageService';
import type { CanvasElement } from '@/types/template';

function makeElement(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    name: `Element ${id}`,
    type: 'text',
    x: 10,
    y: 10,
    width: 30,
    height: 8,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    ...overrides,
  };
}

describe('templateService', () => {
  beforeEach(async () => {
    await getDatabase().delete();
    getDatabase().open();
  });

  afterEach(async () => {
    await getDatabase().delete();
  });

  it('creates a dual-sided CR80 template', () => {
    const template = createTemplate('Test Card');
    expect(template.name).toBe('Test Card');
    expect(template.frontSide.sideType).toBe('front');
    expect(template.backSide.sideType).toBe('back');
    expect(template.frontSide.canvasWidth).toBeCloseTo(85.6);
    expect(template.frontSide.canvasHeight).toBe(54);
    expect(template.frontSide.elements).toHaveLength(0);
    expect(template.id).not.toBe(template.frontSide); // sanity
  });

  it('saves and loads a template with elements', async () => {
    const template = createTemplate('Employee');
    const side = upsertElement(template.frontSide, makeElement('e1'));
    await saveTemplate({ ...template, frontSide: side });
    const loaded = await loadTemplate(template.id);
    expect(loaded.name).toBe('Employee');
    expect(loaded.frontSide.elements).toHaveLength(1);
    expect(loaded.frontSide.elements[0]?.id).toBe('e1');
  });

  it('throws when loading a missing template', async () => {
    await expect(loadTemplate('nope')).rejects.toThrow('Template not found');
  });

  it('lists and deletes templates', async () => {
    const template = createTemplate('One');
    await saveTemplate(template);
    await saveTemplate(createTemplate('Two'));
    const all = await listTemplates();
    expect(all).toHaveLength(2);
    await deleteTemplate(template.id);
    await expect(listTemplates()).resolves.toHaveLength(1);
  });

  it('duplicates a template under a new id', async () => {
    const template = createTemplate('Original');
    const copy = await duplicateTemplate(template, 'Copy');
    expect(copy.id).not.toBe(template.id);
    expect(copy.name).toBe('Copy');
    expect(copy.frontSide).toEqual(template.frontSide);
    // Original was not persisted in this test — only the copy exists
    const all = await listTemplates();
    expect(all.map((summary) => summary.id)).toContain(copy.id);
  });

  it('upsertElement inserts then updates in place', () => {
    let side = createEmptySide('front', 85.6, 54);
    side = upsertElement(side, makeElement('a'));
    side = upsertElement(side, makeElement('b'));
    expect(side.elements).toHaveLength(2);
    side = upsertElement(side, makeElement('a', { x: 42 }));
    expect(side.elements).toHaveLength(2);
    expect(side.elements.find((element) => element.id === 'a')?.x).toBe(42);
  });

  it('removeElement removes only the target', () => {
    let side = createEmptySide('front', 85.6, 54);
    side = upsertElement(side, makeElement('a'));
    side = upsertElement(side, makeElement('b'));
    side = removeElement(side, 'a');
    expect(side.elements.map((element) => element.id)).toEqual(['b']);
  });
});
