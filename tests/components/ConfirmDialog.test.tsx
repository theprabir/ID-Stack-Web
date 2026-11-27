import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui';

/**
 * The in-app replacement for `window.confirm`: it must be a labelled
 * alertdialog, focus Cancel (never the destructive action), close on Escape or
 * the backdrop, and hand focus back to whatever opened it.
 */
describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function Harness({
    destructive = false,
    onConfirm = vi.fn(),
    onCancel = vi.fn(),
  }: {
    destructive?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Remove source
        </button>
        <ConfirmDialog
          open={open}
          title="Remove &quot;Class 5&quot;?"
          description="Its rows are discarded for this session."
          confirmLabel="Remove"
          destructive={destructive}
          onCancel={() => {
            setOpen(false);
            onCancel();
          }}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        />
      </div>
    );
  }

  it('renders nothing until opened, then an alertdialog with title and description', () => {
    render(<Harness />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove source/i }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Remove "Class 5"?');
    expect(dialog).toHaveAccessibleDescription('Its rows are discarded for this session.');
  });

  it('focuses Cancel, and only the confirm button runs the action', () => {
    const onConfirm = vi.fn();
    render(<Harness destructive onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /remove source/i }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /remove source/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('returns focus to the control that opened it', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: /remove source/i });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(opener).toHaveFocus();
  });
});
