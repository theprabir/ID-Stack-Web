import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Theme-aware native select styled to match shadcn/ui look. */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // No vertical padding: a native select centres its text itself. Compact
        // heights (h-7/h-9) previously combined with py-2 and left only 12px of
        // content box for 12px text, so the label rendered with its top half
        // clipped (e.g. a font name showing "half").
        'flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm leading-normal ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export { Select };
