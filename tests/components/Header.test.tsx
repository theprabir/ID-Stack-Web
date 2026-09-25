import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '@/components/common';
import { useUIStore } from '@/stores/uiStore';

describe('Header', () => {
  beforeEach(() => {
    useUIStore.setState({ theme: 'dark', isLoading: false });
  });

  it('renders navigation and theme toggle', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('toggles theme when the sun/moon button is clicked', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    const toggle = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(toggle);
    expect(useUIStore.getState().theme).toBe('light');
    fireEvent.click(toggle);
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('shows Sun icon in dark mode (to switch to light)', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(document.querySelector('svg.lucide-sun')).toBeInTheDocument();
  });
});
