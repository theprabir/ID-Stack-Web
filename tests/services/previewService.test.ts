import { describe, it, expect } from 'vitest';
import {
  createValueResolver,
  substituteText,
  renderSidePreview,
  clearPreviewImageCache,
} from '@/services/previewService';
import type { CardTemplate, CanvasElement } from '@/types/template';
import type { DataRow } from '@/types/data';

function makeElement(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    name: id,
    type: 'text',
    x: 1,
    y: 1,
    width: 30,
    height: 8,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    fill: { type: 'solid', color: '#111111' },
    ...overrides,
  };
}

function makeTemplate(elements: CanvasElement[]): CardTemplate {
  const side = {
    sideType: 'front' as const,
    canvasWidth: 85.6,
    canvasHeight: 54,
    backgroundColor: '#FFFFFF',
    elements,
  };
  return {
    id: 't1',
    name: 'Test',
    version: '1.0',
    createdDate: '2026-01-01',
    modifiedDate: '2026-01-01',
    frontSide: side,
    backSide: { ...side, sideType: 'back' as const, elements: [] },
    metadata: {},
  };
}

describe('previewService — value resolution', () => {
  it('resolves mapped values from the row', () => {
    const resolve = createValueResolver(
      { Name: 'FullName' },
      { rowIndex: 0, values: { FullName: 'Asha' } }
    );
    expect(resolve('Name')).toBe('Asha');
  });

  it('falls back to the token when unmapped or empty', () => {
    const resolve = createValueResolver({}, { rowIndex: 0, values: { FullName: 'Asha' } });
    expect(resolve('Name')).toBe('{{Name}}');
    const resolve2 = createValueResolver(
      { Name: 'FullName' },
      { rowIndex: 0, values: { FullName: '' } }
    );
    expect(resolve2('Name')).toBe('{{Name}}');
  });

  it('substituteText replaces all tokens', () => {
    const resolve = createValueResolver(
      { Name: 'FullName', ID: 'EmpID' },
      { rowIndex: 0, values: { FullName: 'Asha', EmpID: 'E001' } }
    );
    expect(substituteText('Hello {{Name}} (#{{ID}})', resolve)).toBe('Hello Asha (#E001)');
  });

  it('substituteText leaves malformed tokens intact', () => {
    const resolve = createValueResolver({}, null);
    expect(substituteText('{{}}', resolve)).toBe('{{}}');
  });
});

describe('previewService — rendering', () => {
  const row: DataRow = { rowIndex: 0, values: { Name: 'Asha', ID: 'E001' } };
  const mappings = { Name: 'Name', ID: 'ID' };

  it('renders a canvas at 96-DPI scale with substituted data', async () => {
    const template = makeTemplate([
      makeElement('t1', { type: 'text', text: 'Hello {{Name}}', fontSize: 12 }),
    ]);
    const canvas = await renderSidePreview(template, 'front', row, mappings);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    // 85.6mm × 3.7795 px/mm ≈ 323.5 → 324
    expect(canvas.width).toBeGreaterThan(300);
    expect(canvas.width).toBeLessThan(350);
  });

  it('renders raw tokens when row is null', async () => {
    const template = makeTemplate([
      makeElement('t1', { type: 'text', text: 'Hello {{Name}}', fontSize: 12 }),
    ]);
    await expect(renderSidePreview(template, 'front', null, mappings)).resolves.toBeInstanceOf(
      HTMLCanvasElement
    );
  });

  it('skips invisible elements without failing', async () => {
    const template = makeTemplate([
      makeElement('hidden', { visible: false, type: 'shape', shapeKind: 'rect' }),
      makeElement('visible', { type: 'shape', shapeKind: 'circle' }),
    ]);
    await expect(renderSidePreview(template, 'front', row, mappings)).resolves.toBeInstanceOf(
      HTMLCanvasElement
    );
  });

  it('draws a dashed box for missing photos', async () => {
    clearPreviewImageCache();
    const template = makeTemplate([
      makeElement('img1', { type: 'image', imageSrc: 'ignored', width: 20, height: 25 }),
    ]);
    await expect(
      renderSidePreview(template, 'front', row, mappings, { getPhoto: () => undefined })
    ).resolves.toBeInstanceOf(HTMLCanvasElement);
  });

  it('renders shapes and barcodes without failing', async () => {
    const template = makeTemplate([
      makeElement('r', { type: 'shape', shapeKind: 'rect', cornerRadius: 2 }),
      makeElement('l', { type: 'shape', shapeKind: 'line' }),
      makeElement('bc', { type: 'barcode', barcodeType: 'qrcode', barcodeData: '{{ID}}' }),
    ]);
    await expect(renderSidePreview(template, 'front', row, mappings)).resolves.toBeInstanceOf(
      HTMLCanvasElement
    );
  });
});
