import { describe, it, expect, beforeEach } from 'vitest';
import { useDataStore } from '@/stores/dataStore';
import type { ExcelSource } from '@/types/data';

const source: ExcelSource = {
  id: 's1',
  fileName: 'Class 5.xlsx',
  sheetName: 'Sheet1',
  label: 'Class 5.xlsx',
  baseName: 'Class 5',
  columns: ['Name'],
  rows: [{ rowIndex: 0, values: { Name: 'Asha' }, sourceId: 's1', uid: 's1::0' }],
  signature: 'name',
};

describe('dataStore.revalidate — ExcelData identity (v0.7.6)', () => {
  beforeEach(() => {
    useDataStore.setState({
      sources: [source],
      activeSourceId: 's1',
      excelData: null,
      mappings: {},
      photoLibraries: [],
      photos: [],
      photoSourceMap: {},
      photoMatchConfig: { mode: 'filename' },
      photoMatchResult: null,
      photoMatchBySource: {},
      validation: null,
    });
  });

  it('reuses the same ExcelData object while the source rows are unchanged', () => {
    useDataStore.getState().revalidate();
    const first = useDataStore.getState().excelData;
    expect(first).not.toBeNull();
    expect(first?.rows).toBe(source.rows);

    // IdStudio calls revalidate in an effect that depends on `excelData`;
    // a fresh object here would re-trigger it forever.
    useDataStore.getState().revalidate();
    expect(useDataStore.getState().excelData).toBe(first);
  });

  it('produces per-source photo matches keyed by the scoped row identity', () => {
    useDataStore.getState().revalidate();
    expect(useDataStore.getState().photoMatchBySource.s1).toBeDefined();
    expect(useDataStore.getState().photoMatchBySource.s1?.unmatchedRowIndexes).toEqual([0]);
  });

  it('never previews a blocked source when a valid one exists', () => {
    const blocked: ExcelSource = {
      ...source,
      id: 'bad',
      label: 'Blocked.xlsx',
      baseName: 'Blocked',
      rows: [{ rowIndex: 0, values: { Name: 'Wrong' }, sourceId: 'bad', uid: 'bad::0' }],
      error: 'Columns do not match.',
    };
    useDataStore.setState({
      sources: [blocked, source],
      activeSourceId: 'bad',
      excelData: { columns: blocked.columns, rows: blocked.rows, fileName: blocked.label },
    });

    useDataStore.getState().revalidate();
    const state = useDataStore.getState();
    expect(state.activeSourceId).toBe('s1');
    expect(state.excelData?.rows).toBe(source.rows);
  });

  it('re-baselines on a valid source when the old baseline is removed', () => {
    const validC: ExcelSource = {
      ...source,
      id: 's3',
      label: 'Class 7.xlsx',
      baseName: 'Class 7',
      rows: [{ rowIndex: 0, values: { Name: 'Mina' }, sourceId: 's3', uid: 's3::0' }],
    };
    const blocked: ExcelSource = {
      ...source,
      id: 'bad',
      label: 'Blocked.xlsx',
      baseName: 'Blocked',
      signature: 'roll',
      error: 'Columns do not match.',
    };
    useDataStore.setState({
      sources: [source, blocked, validC],
      activeSourceId: 's3',
    });

    useDataStore.getState().removeSource('s1');
    const state = useDataStore.getState();
    expect(state.sources.find((entry) => entry.id === 's3')?.error).toBeUndefined();
    expect(state.sources.find((entry) => entry.id === 'bad')?.error).toBeDefined();
    expect(state.activeSourceId).toBe('s3');
  });
});
