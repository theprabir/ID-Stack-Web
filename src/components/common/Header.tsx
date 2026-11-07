import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';

/**
 * Top application bar: logo and the theme toggle.
 * Page navigation lives in the left sidebar.
 */
export function Header(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const isLoading = useUIStore((state) => state.isLoading);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-surface-panel px-4 transition-colors duration-300">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img
            src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            className="h-7 w-7 rounded"
          />
          <span>ID Stack</span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {isLoading && (
          <span
            className="mr-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            role="status"
            aria-label="Loading…"
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  );
}
