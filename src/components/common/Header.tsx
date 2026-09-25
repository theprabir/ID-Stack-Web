import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IdCard, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Top application bar: logo, language switcher and the theme toggle.
 * Page navigation lives in the left sidebar.
 */
export function Header(): JSX.Element {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isLoading = useUIStore((state) => state.isLoading);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-surface-panel px-4 transition-colors duration-300">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <IdCard className="h-6 w-6 text-primary" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {isLoading && (
          <span
            className="mr-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            role="status"
            aria-label={t('common.loading')}
          />
        )}
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={t('theme.toggle')}
          aria-label={t('theme.toggle')}
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
