import { describe, it, expect } from 'vitest';
import { collectPlaceholderKeys } from '@/types/psd';
import { createRowResolver } from '@/services/psdCompositeService';
import { buildName } from '@/services/batchNaming';
import type { PsdPlaceholder } from '@/types/psd';
import type { DataRow } from '@/types/data';

describe('PSD pipeline — placeholders', () => {
  it('collects unique placeholder keys in order', () => {
    const placeholders: PsdPlaceholder[] = [
      { layerId: 'front/Name', layerName: 'Name', role: 'text', side: 'front', key: 'Name' },
      { layerId: 'front/Photo', layerName: 'Photo', role: 'photo', side: 'front', key: 'Photo' },
      { layerId: 'back/Name', layerName: 'Name', role: 'text', side: 'back', key: 'Name' },
      { layerId: 'back/Barcode', layerName: 'Barcode', role: 'text', side: 'back', key: 'Barcode' },
    ];
    expect(collectPlaceholderKeys(placeholders)).toEqual(['Name', 'Photo', 'Barcode']);
  });
});

describe('PSD pipeline — row resolver', () => {
  const mappings = { Name: 'FullName', ID: 'EmpID' };
  const row: DataRow = { rowIndex: 0, values: { FullName: 'Asha', EmpID: '' } };

  it('resolves mapped non-empty values', () => {
    const resolve = createRowResolver(mappings, row);
    expect(resolve('Name')).toBe('Asha');
  });

  it('returns empty for empty cell (caller keeps PSD sample text)', () => {
    const resolve = createRowResolver(mappings, row);
    expect(resolve('ID')).toBe('');
  });

  it('returns empty for unmapped keys', () => {
    const resolve = createRowResolver(mappings, row);
    expect(resolve('Photo')).toBe('');
  });

  it('returns empty when row is null (design preview)', () => {
    const resolve = createRowResolver(mappings, null);
    expect(resolve('Name')).toBe('');
  });
});

describe('PSD pipeline — batch file naming', () => {
  const row: DataRow = {
    rowIndex: 4,
    values: { Name: 'Asha Kumar', ID: 'E001', Dept: 'R&D' },
  };

  it('substitutes {Column} tokens and sanitises unsafe characters', () => {
    expect(buildName('{Name}_{ID}', row)).toBe('Asha Kumar_E001');
    // '&' is legal in file names; slashes etc. become underscores.
    expect(buildName('card_{Dept}', row)).toBe('card_R&D');
    expect(buildName('card_{Dept}', row)).toBe('card_R&D');
  });

  it('supports {Row} with zero padding', () => {
    expect(buildName('Card_{Row}', row)).toBe('Card_005');
  });

  it('supports {{Column}} syntax too', () => {
    expect(buildName('{{ID}}-{{Name}}', row)).toBe('E001-Asha Kumar');
  });

  it('leaves unknown tokens intact', () => {
    expect(buildName('card_{Unknown}', row)).toBe('card_{Unknown}');
  });
});
