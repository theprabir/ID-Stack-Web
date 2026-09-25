import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore } from '@/stores/uiStore';

function ThemeToggleButton(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

describe('ThemeProvider', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    useUIStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('applies the dark class to <html> by default', () => {
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    expect(document.documentElement).toHaveClass('dark');
  });

  it('applies the light class and color-scheme after toggle', () => {
    render(
      <ThemeProvider>
        <ThemeToggleButton />
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('dark');
    fireEvent.click(button);
    expect(document.documentElement).toHaveClass('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('adopts OS light preference when the user has no stored choice', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('light'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    // Simulate a true first visit: no persisted preference at all.
    localStorage.removeItem('id-card-ui-preferences');

    act(() => {
      render(
        <ThemeProvider>
          <div>content</div>
        </ThemeProvider>
      );
    });
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('keeps the stored theme over OS preference', async () => {
    // Force the persisted preference BEFORE the provider reads it.
    useUIStore.setState({ theme: 'light' });
    await act(async () => {
      render(
        <ThemeProvider>
          <div>content</div>
        </ThemeProvider>
      );
    });
    expect(document.documentElement).toHaveClass('light');
  });
});
