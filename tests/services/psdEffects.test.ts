/**
 * Tests for Photoshop layer-effect extraction (v0.5.4).
 * Verifies that ag-psd effects are normalised into the renderer-agnostic
 * PsdLayerEffects shape with correct units, colours and disabled filtering.
 */
import { describe, it, expect } from 'vitest';
import { extractLayerEffects } from '@/services/psdService';
import type { LayerEffectsInfo } from 'ag-psd/dist/psd.d';

describe('extractLayerEffects', () => {
  it('returns undefined when there are no effects', () => {
    expect(extractLayerEffects(undefined)).toBeUndefined();
    expect(extractLayerEffects({})).toBeUndefined();
  });

  it('returns undefined when the whole effect set is disabled', () => {
    expect(extractLayerEffects({ disabled: true })).toBeUndefined();
  });

  it('extracts a drop shadow with Photoshop angle/distance semantics', () => {
    const effects: LayerEffectsInfo = {
      dropShadow: [
        {
          enabled: true,
          color: { r: 255, g: 0, b: 0 },
          opacity: 0.5,
          angle: 90,
          distance: { units: 'Pixels', value: 4 },
          size: { units: 'Pixels', value: 10 },
        },
      ],
    };
    const result = extractLayerEffects(effects);
    expect(result?.dropShadows).toHaveLength(1);
    const shadow = result?.dropShadows?.[0]!;
    expect(shadow.color).toBe('#ff0000');
    expect(shadow.opacity).toBe(0.5);
    expect(shadow.angle).toBe(90);
    expect(shadow.distance).toBe(4);
    expect(shadow.blur).toBe(5); // size/2 (Photoshop size ≈ diameter)
  });

  it('skips disabled effects and keeps enabled ones', () => {
    const effects: LayerEffectsInfo = {
      dropShadow: [
        { enabled: false, color: { r: 0, g: 0, b: 0 }, opacity: 1 },
        {
          enabled: true,
          color: { r: 0, g: 0, b: 0 },
          opacity: 0.75,
          angle: 120,
          distance: { units: 'Pixels', value: 2 },
          size: { units: 'Pixels', value: 6 },
        },
      ],
    };
    const result = extractLayerEffects(effects);
    expect(result?.dropShadows).toHaveLength(1);
    expect(result?.dropShadows?.[0]?.opacity).toBe(0.75);
  });

  it('extracts stroke with position and colour', () => {
    const effects: LayerEffectsInfo = {
      stroke: [
        {
          enabled: true,
          size: { units: 'Pixels', value: 3 },
          position: 'inside',
          color: { r: 10, g: 20, b: 30 },
          opacity: 0.9,
        },
      ],
    };
    const result = extractLayerEffects(effects);
    expect(result?.stroke).toEqual({
      color: '#0a141e',
      width: 3,
      position: 'inside',
      opacity: 0.9,
    });
  });

  it('extracts outer glow, inner glow and colour overlay (solidFill)', () => {
    const effects: LayerEffectsInfo = {
      outerGlow: {
        enabled: true,
        color: { r: 255, g: 255, b: 0 },
        opacity: 0.4,
        size: { units: 'Pixels', value: 8 },
      },
      innerGlow: {
        enabled: true,
        color: { r: 0, g: 255, b: 255 },
        opacity: 0.6,
        size: { units: 'Pixels', value: 4 },
      },
      solidFill: [{ enabled: true, color: { r: 1, g: 2, b: 3 }, opacity: 1 }],
    };
    const result = extractLayerEffects(effects);
    expect(result?.outerGlow?.color).toBe('#ffff00');
    expect(result?.outerGlow?.blur).toBe(4);
    expect(result?.innerGlow?.color).toBe('#00ffff');
    expect(result?.solidFill?.color).toBe('#010203');
  });

  it('normalises CMYK effect colours via the shared converter', () => {
    const effects: LayerEffectsInfo = {
      dropShadow: [
        {
          enabled: true,
          // Pure cyan ink (255,0,0,0 on the 0-255 CMYK scale) → #00ffff.
          color: { c: 255, m: 0, y: 0, k: 0 },
          opacity: 1,
          angle: 30,
          distance: { units: 'Pixels', value: 1 },
          size: { units: 'Pixels', value: 2 },
        },
      ],
    };
    const result = extractLayerEffects(effects);
    expect(result?.dropShadows?.[0]?.color).toBe('#00ffff');
  });
});
