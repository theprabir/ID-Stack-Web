import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import { changeLanguage } from '@/i18n';
import { LANGUAGES } from '@/constants/languages';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Label,
  Select,
  Checkbox,
  Button,
} from '@/components/ui';
import { Sun, Moon } from 'lucide-react';

/**
 * Application settings: language, measurement units, auto-save and appearance.
 */
export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const language = useSettingsStore((state) => state.language);
  const unit = useSettingsStore((state) => state.unit);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setUnit = useSettingsStore((state) => state.setUnit);
  const setAutoSave = useSettingsStore((state) => state.setAutoSave);

  const handleLanguageChange = async (code: string): Promise<void> => {
    setLanguage(code);
    await changeLanguage(code);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.languageSection')}</CardTitle>
          <CardDescription>{t('language.change')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="language-select">{t('language.label')}</Label>
            <Select
              id="language-select"
              value={language}
              onChange={(event) => void handleLanguageChange(event.target.value)}
              className="max-w-xs"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.units')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit-select">{t('settings.units')}</Label>
            <Select
              id="unit-select"
              value={unit}
              onChange={(event) => setUnit(event.target.value as 'mm' | 'inch')}
              className="max-w-xs"
            >
              <option value="mm">{t('settings.unitsMM')}</option>
              <option value="inch">{t('settings.unitsInch')}</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
          <CardDescription>{t('settings.themeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-4 w-4" aria-hidden="true" />
              {t('theme.dark')}
            </Button>
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              <Sun className="h-4 w-4" aria-hidden="true" />
              {t('theme.light')}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="autosave-toggle"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
            />
            <div className="flex flex-col">
              <Label htmlFor="autosave-toggle">{t('settings.autoSave')}</Label>
              <span className="text-xs text-muted-foreground">
                {t('settings.autoSaveDescription')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
