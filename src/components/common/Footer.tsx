import { useTranslation } from 'react-i18next';
import { WifiOff, ShieldCheck } from 'lucide-react';

/**
 * Bottom status bar with privacy/offline badges.
 */
export function Footer(): JSX.Element {
  const { t } = useTranslation();

  return (
    <footer className="flex h-8 items-center justify-between border-t bg-surface-panel px-4 text-xs text-muted-foreground transition-colors duration-300">
      <span>{t('app.tagline')}</span>
      <span className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t('footer.clientSide')}
        </span>
        <span className="flex items-center gap-1">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          {t('footer.offlineReady')}
        </span>
      </span>
    </footer>
  );
}
