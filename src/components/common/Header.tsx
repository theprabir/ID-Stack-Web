import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IdCard, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Top application bar: logo, primary navigation and the theme toggle
 * (top-right, available on every page per Design.md).
 */
export function Header(): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isLoading = useUIStore((state) => state.isLoading);

  const navItems = [
    { to: '/', label: t('nav.editor'), active: location.pathname === '/' },
    { to: '/library', label: t('nav.library'), active: location.pathname === '/library' },
    { to: '/settings', label: t('nav.settings'), active: location.pathname === '/settings' },
    { to: '/about', label: t('nav.about'), active: location.pathname === '/about' },
  ];

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-surface-panel px-4 transition-colors duration-300">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <IdCard className="h-6 w-6 text-primary" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </Link>
        <nav aria-label={t('app.name')}>
          <ul className="flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    item.active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
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
