import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui';
import { APP_VERSION } from '@/constants/app';

/**
 * About page: app info, privacy statement and license.
 */
export function AboutPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t('about.title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('app.name')}</CardTitle>
          <CardDescription>
            {t('about.version')} {APP_VERSION}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{t('about.description')}</p>
          <p>{t('about.privacy')}</p>
          <p>{t('about.license')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
