import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      theme: 'dark',
      themeId: 'classic',
      sidebarCollapsed: false,
      isLoading: false,
    });
  });

  it('defaults to dark theme', () => {
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('toggles theme between dark and light', () => {
    const { toggleTheme } = useUIStore.getState();
    toggleTheme();
    expect(useUIStore.getState().theme).toBe('light');
    toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('sets an explicit theme', () => {
    useUIStore.getState().setTheme('light');
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('persists theme to localStorage', () => {
    useUIStore.getState().setTheme('light');
    const stored = JSON.parse(localStorage.getItem('id-stack-ui-preferences') ?? '{}');
    expect(stored.state?.theme).toBe('light');
  });

  it('defaults to the classic palette', () => {
    expect(useUIStore.getState().themeId).toBe('classic');
  });

  it('sets and persists a palette id', () => {
    useUIStore.getState().setThemeId('lime');
    expect(useUIStore.getState().themeId).toBe('lime');
    const stored = JSON.parse(localStorage.getItem('id-stack-ui-preferences') ?? '{}');
    expect(stored.state?.themeId).toBe('lime');
  });

  it('keeps palette and mode independent', () => {
    useUIStore.getState().setThemeId('teal');
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().themeId).toBe('teal');
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('rejects an unknown palette id via isValidThemeId', async () => {
    const { isValidThemeId } = await import('@/stores/uiStore');
    expect(isValidThemeId('classic')).toBe(true);
    expect(isValidThemeId('lime')).toBe(true);
    expect(isValidThemeId('teal')).toBe(true);
    expect(isValidThemeId('neon')).toBe(false);
    expect(isValidThemeId(42)).toBe(false);
  });

  it('manages sidebar and loading state without persisting them', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setLoading(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(useUIStore.getState().isLoading).toBe(true);
    const stored = JSON.parse(localStorage.getItem('id-stack-ui-preferences') ?? '{}');
    expect(stored.state?.sidebarCollapsed).toBeUndefined();
  });
});
