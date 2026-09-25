import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  /** Additional classes for the wrapper */
  className?: string;
  /** Optional label; defaults to "Loading…" */
  label?: string;
}

/**
 * Centered spinner with accessible loading label.
 */
export function LoadingSpinner({ className, label }: LoadingSpinnerProps): JSX.Element {
  return (
    <div
      className={cn('flex items-center justify-center gap-3 p-8', className)}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden="true"
      />
      <span className="text-sm text-muted-foreground">{label ?? 'Loading…'}</span>
    </div>
  );
}
