import { describe, it, expect, beforeEach } from 'vitest';
import { useDataStore } from '@/stores/dataStore';
import { usePsdStore } from '@/stores/psdStore';
import type { PsdPlaceholder } from '@/types/psd';

/** Seed both stores with placeholders + an Excel header row */
function seed(columns: string[]): void {
  const placeholder = (key: string): PsdPlaceholder => ({
    layerId: `front/${key}`,
    layerName: key,
    role: 'text',
    side: 'front',
    key,
  });
  usePsdStore.setState({
    project: {
      front: null,
      back: null,
      placeholders: [placeholder('Name'), placeholder('ID'), placeholder('Photo')],
    },
  });
  useDataStore.setState({
    excelData: { columns, rows: [], fileName: 'test.xlsx' },
    mappings: {},
  });
}

describe('dataStore.autoMapColumns — weighted fuzzy matching (v0.7.1)', () => {
  beforeEach(() => {
    useDataStore.setState({ excelData: null, mappings: {} });
    usePsdStore.setState({ project: { front: null, back: null, placeholders: [] } });
  });

  it('score 100: exact match (case-insensitive)', () => {
    seed(['Name', 'ID', 'Photo']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({
      Name: 'Name',
      ID: 'ID',
      Photo: 'Photo',
    });
  });

  it('score 80: column header is a substring of the placeholder (or vice versa)', () => {
    seed(['Employee Name', 'Roll No', 'Profile']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({
      Name: 'Employee Name', // score 80: "name" is inside "employee name"
      ID: 'Roll No', // score 60: "roll no" is an ID synonym
      Photo: 'Profile', // score 60: "profile" is a Photo synonym
    });
  });

  it('score 60: synonym dictionary matches only the OWN placeholder', () => {
    // "user" is a Name synonym and matches nothing else by substring.
    seed(['user']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({ Name: 'user' });
  });

  it('score 60: a synonym of ANOTHER placeholder never maps (cross-guard)', () => {
    // Regression: the old implementation returned 60 for any placeholder
    // when the column matched ANY dictionary entry, so "user" (a Name
    // synonym) also mapped onto Photo. It must not.
    seed(['user', 'image']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({ Name: 'user', Photo: 'image' });
  });

  it('score 40 (shared keyword) stays BELOW the > 40 threshold', () => {
    // "Date of Birth" vs "Birth Date" share words but no substring/synonym.
    usePsdStore.setState({
      project: {
        front: null,
        back: null,
        placeholders: [
          {
            layerId: 'front/Date of Birth',
            layerName: 'Date of Birth',
            role: 'text',
            side: 'front',
            key: 'Date of Birth',
          },
        ],
      },
    });
    useDataStore.setState({
      excelData: { columns: ['Birth Date'], rows: [], fileName: 'test.xlsx' },
      mappings: {},
    });
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({});
  });

  it('empty column headers never match anything', () => {
    seed(['', '  ']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({});
  });

  it('unrelated columns produce no mappings', () => {
    seed(['dob', 'address line 1']);
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({});
  });

  it('auto-map REPLACES previous mappings wholesale', () => {
    seed(['Name']);
    useDataStore.setState({ mappings: { ID: 'stale-column', Photo: 'old' } });
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({ Name: 'Name' });
  });

  it('is a no-op without imported Excel data', () => {
    usePsdStore.setState({
      project: {
        front: null,
        back: null,
        placeholders: [
          { layerId: 'f/Name', layerName: 'Name', role: 'text', side: 'front', key: 'Name' },
        ],
      },
    });
    useDataStore.setState({ excelData: null, mappings: { keep: 'me' } });
    useDataStore.getState().autoMapColumns();
    expect(useDataStore.getState().mappings).toEqual({ keep: 'me' });
  });
});
