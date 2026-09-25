import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ language: 'en', unit: 'mm', autoSave: true });
  });

  it('defaults to English, millimetres and auto-save on', () => {
    const state = useSettingsStore.getState();
    expect(state.language).toBe('en');
    expect(state.unit).toBe('mm');
    expect(state.autoSave).toBe(true);
  });

  it('changes and persists language', () => {
    useSettingsStore.getState().setLanguage('hi');
    expect(useSettingsStore.getState().language).toBe('hi');
    const stored = JSON.parse(localStorage.getItem('id-card-settings') ?? '{}');
    expect(stored.state?.language).toBe('hi');
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
