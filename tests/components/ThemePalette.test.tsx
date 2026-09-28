import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { useUIStore, isValidThemeId } from '@/stores/uiStore';

/**
 * Palette switching: data-theme on <html> plus stale-id fallback.
 * The light/dark class behaviour is covered by ThemeProvider.test.tsx.
 */
describe('ThemeProvider palettes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
    useUIStore.setState({ theme: 'dark', themeId: 'classic' });
  });

  it('applies data-theme="classic" by default', () => {
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    expect(document.documentElement.dataset.theme).toBe('classic');
  });

  it('switches the data-theme attribute when the palette changes', () => {
    function PaletteButton(): JSX.Element {
      const themeId = useUIStore((state) => state.themeId);
      const setThemeId = useUIStore((state) => state.setThemeId);
      return (
        <button type="button" onClick={() => setThemeId('lime')}>
          {themeId}
        </button>
      );
    }
    render(
      <ThemeProvider>
        <PaletteButton />
      </ThemeProvider>
    );
    expect(document.documentElement.dataset.theme).toBe('classic');
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('lime');
    expect(document.documentElement).toHaveClass('dark'); // mode unchanged
  });

  it('keeps the palette when the light/dark mode toggles', () => {
    useUIStore.setState({ themeId: 'teal' });
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    act(() => {
      useUIStore.getState().toggleTheme();
    });
    expect(document.documentElement.dataset.theme).toBe('teal');
    expect(document.documentElement).toHaveClass('light');
  });

  it('falls back to classic on a stale persisted palette id', () => {
    // Simulate corrupted persisted state (a palette that no longer exists).
    useUIStore.setState({ themeId: 'retro' as never });
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    expect(useUIStore.getState().themeId).toBe('classic');
    expect(document.documentElement.dataset.theme).toBe('classic');
  });

  it('isValidThemeId accepts only known palettes', () => {
    expect(isValidThemeId('classic')).toBe(true);
    expect(isValidThemeId('lime')).toBe(true);
    expect(isValidThemeId('teal')).toBe(true);
    expect(isValidThemeId('retro')).toBe(false);
    expect(isValidThemeId(undefined)).toBe(false);
  });
});
