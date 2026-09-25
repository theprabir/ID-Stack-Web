import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { changeLanguage } from '@/i18n';
import { LANGUAGES } from '@/constants/languages';
import { Select } from '@/components/ui';

/**
 * Dropdown to switch the interface language (all 11 supported languages).
 * Loads the locale bundle on demand and persists the choice.
 */
export function LanguageSwitcher(): JSX.Element {
  const { t } = useTranslation();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value;
      setLanguage(next);
      await changeLanguage(next);
    },
    [setLanguage]
  );

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select
        aria-label={t('language.change')}
        value={language}
        onChange={(event) => void handleChange(event)}
        className="h-8 w-32 text-xs"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </Select>
    </div>
  );
}
