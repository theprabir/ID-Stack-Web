import { useTemplateStore } from '@/stores/templateStore';
import { cn } from '@/lib/utils';

/** Tabs to switch between the front and back card faces. */
export function TemplateTabs(): JSX.Element {
  const currentSide = useTemplateStore((state) => state.currentSide);
  const switchSide = useTemplateStore((state) => state.switchSide);

  const tabs: Array<{ key: 'front' | 'back'; label: string }> = [
    { key: 'front', label: 'Front Side' },
    { key: 'back', label: 'Back Side' },
  ];

  return (
    <div
      className="flex items-center gap-1 border-t bg-surface-panel px-3 py-1.5 transition-colors duration-300"
      role="tablist"
    >
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={currentSide === key}
          onClick={() => switchSide(key)}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm transition-colors',
            currentSide === key
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
