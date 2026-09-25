import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: 'dark', sidebarCollapsed: false, isLoading: false });
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

  it('manages sidebar and loading state without persisting them', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setLoading(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(useUIStore.getState().isLoading).toBe(true);
    const stored = JSON.parse(localStorage.getItem('id-stack-ui-preferences') ?? '{}');
    expect(stored.state?.sidebarCollapsed).toBeUndefined();
  });
});
