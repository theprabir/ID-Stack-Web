import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/** One wizard step definition */
export interface StudioStep {
  /** 1-based step number */
  number: number;
  label: string;
  description: string;
}

interface StudioStepperProps {
  steps: StudioStep[];
  currentStep: number;
  /** Highest step the user may jump to (previous gates passed) */
  maxReachableStep: number;
  onSelectStep: (step: number) => void;
}

/**
 * Clickable step chips for the PSD Studio wizard. Completed and reachable
 * steps can be clicked to move back and forth; future steps are locked
 * until their requirements are met.
 */
export function StudioStepper({
  steps,
  currentStep,
  maxReachableStep,
  onSelectStep,
}: StudioStepperProps): JSX.Element {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Card creation steps">
      {steps.map((step) => {
        const isCurrent = step.number === currentStep;
        const isDone = step.number < maxReachableStep;
        const isReachable = step.number <= maxReachableStep;
        return (
          <li key={step.number}>
            <button
              type="button"
              disabled={!isReachable}
              aria-current={isCurrent ? 'step' : undefined}
              title={step.description}
              onClick={() => onSelectStep(step.number)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                isCurrent
                  ? 'border-primary/60 bg-primary/10 font-medium text-primary'
                  : isDone
                    ? 'border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10'
                    : isReachable
                      ? 'border-border text-muted-foreground hover:bg-accent/10'
                      : 'border-border/50 text-muted-foreground/50'
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                  isDone ? 'border-green-500/60 bg-green-500/10' : 'border-current'
                )}
                aria-hidden="true"
              >
                {isDone ? <Check className="h-2.5 w-2.5" /> : step.number}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

interface StudioNavButtonsProps {
  currentStep: number;
  totalSteps: number;
  canProceed: boolean;
  blockedReason: string | null;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Back / Next navigation bar rendered under the active step panel.
 * Back is always available (except on the first step); Next is gated on
 * the current step's requirements with a human-readable reason.
 */
export function StudioNavButtons({
  currentStep,
  totalSteps,
  canProceed,
  blockedReason,
  onBack,
  onNext,
}: StudioNavButtonsProps): JSX.Element {
  const isLast = currentStep === totalSteps;
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-3">
      <Button variant="outline" onClick={onBack} disabled={currentStep === 1} className="gap-1">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        {blockedReason && !canProceed && (
          <p className="truncate text-xs text-muted-foreground" role="status">
            {blockedReason}
          </p>
        )}
        {!isLast && (
          <Button onClick={onNext} disabled={!canProceed} className="gap-1">
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
