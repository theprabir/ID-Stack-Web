/**
 * Regression test: selecting a placeholder on Step 2 crashed with
 * "Maximum update depth exceeded". The whole wizard must survive the
 * placeholder selection with BatchRunner mounting and every effect
 * (restore/sync/derivation) converging instead of looping.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PsdStudioPage } from '@/pages/PsdStudioPage';
import { usePsdStore } from '@/stores/psdStore';
import { useDataStore } from '@/stores/dataStore';
import { DEFAULT_IMPOSITION_SETTINGS } from '@/services/impositionTypes';
import type { PsdDesign, PsdLayerInfo } from '@/types/psd';
import type { ExcelData } from '@/types/data';

function fakeLayer(id: string, name: string, kind: PsdLayerInfo['kind']): PsdLayerInfo {
  return {
    id,
    name,
    path: [name],
    kind,
    hidden: false,
    bounds: { left: 0, top: 0, right: 100, bottom: 40 },
    opacity: 1,
    blendMode: 'normal',
    hasPixels: kind !== 'text',
    hasEffects: false,
    clipped: false,
    childCount: 0,
    text:
      kind === 'text'
        ? {
            content: `Sample ${name}`,
            fontSize: 24,
            fontFamily: 'ArialMT',
            bold: false,
            italic: false,
            underline: false,
            tracking: 0,
            leading: 28,
            justification: 'left',
          }
        : undefined,
  };
}

function fakeDesign(): PsdDesign {
  return {
    fileName: 'front.psd',
    width: 1056,
    height: 663,
    horizontalResolution: 300,
    layers: [fakeLayer('front/Name', 'Name', 'text'), fakeLayer('front/Photo', 'Photo', 'image')],
    compositeUrl: 'blob:mock-composite',
    layerRasters: {},
  };
}

function fakeExcel(): ExcelData {
  return {
    fileName: 'data.xlsx',
    columns: ['Name', 'Email'],
    rows: [
      { rowIndex: 0, values: { Name: 'Sue Smith', Email: 'sue@example.com' } },
      { rowIndex: 1, values: { Name: 'John Doe', Email: 'john@example.com' } },
      { rowIndex: 2, values: { Name: 'Ann Lee', Email: 'ann@example.com' } },
    ],
  };
}

describe('PsdStudioPage placeholder selection (max-update-depth regression)', () => {
  beforeEach(() => {
    usePsdStore.setState({
      project: { front: fakeDesign(), back: null, placeholders: [] },
      isParsing: false,
      parseError: null,
      impositionSettings: DEFAULT_IMPOSITION_SETTINGS,
      batchState: null,
      batchControl: 'done',
    });
    useDataStore.setState({
      excelData: fakeExcel(),
      mappings: {},
      validation: null,
      photoMatchResult: null,
    });
    // Simulate a stale persisted imposition setting (pre-0.6.1 raw pixels)
    // to exercise the restore + derivation effect interplay.
    void usePsdStore.getState().setImpositionSettings({
      ...DEFAULT_IMPOSITION_SETTINGS,
      cardWidth: 37.26,
      cardHeight: 23.4,
      unit: 'cm',
    });
  });

  it('selecting a text placeholder does not hit maximum update depth', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PsdStudioPage />
      </MemoryRouter>
    );

    // Move to Step 2.
    fireEvent.click(screen.getAllByRole('button', { name: /next/i })[0]!);

    // Select the "Name" text layer as a placeholder.
    fireEvent.click(await screen.findByRole('button', { name: /text/i }));

    // The wizard advanced to a state with one placeholder (no crash).
    expect(usePsdStore.getState().project.placeholders.length).toBe(1);
    expect(document.body.textContent).not.toContain('Maximum update depth');

    // The card size was derived from the 300-DPI design and persisted. The
    // simulated stale persisted unit is 'cm', so derivation stays in cm:
    // 1056×663 px ÷ 300 dpi = 3.52×2.21 in = 8.94×5.61 cm. Never the raw
    // pixel counts (37.26 cm was the pre-0.6.1 stale value — now healed).
    const settings = usePsdStore.getState().impositionSettings;
    expect(settings.unit).toBe('cm');
    expect(Math.max(settings.cardWidth, settings.cardHeight)).toBeCloseTo(8.94, 1);
    expect(Math.min(settings.cardWidth, settings.cardHeight)).toBeCloseTo(5.61, 1);
  });
});
