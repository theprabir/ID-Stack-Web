import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ unit: 'mm', autoSave: true });
  });

  it('defaults to millimetres and auto-save on', () => {
    const state = useSettingsStore.getState();
    expect(state.unit).toBe('mm');
    expect(state.autoSave).toBe(true);
  });

  it('changes measurement unit', () => {
    useSettingsStore.getState().setUnit('inch');
    expect(useSettingsStore.getState().unit).toBe('inch');
  });

  it('toggles auto-save', () => {
    useSettingsStore.getState().setAutoSave(false);
    expect(useSettingsStore.getState().autoSave).toBe(false);
  });
});
