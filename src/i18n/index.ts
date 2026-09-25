import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGUAGES, DEFAULT_LANGUAGE } from '@/constants/languages';

/**
 * Supported language codes — used to build lazy-import loaders.
 */
const languageCodes = LANGUAGES.map((language) => language.code);

/**
 * Dynamically import the translation file for a language.
 * @param code - Language code matching public/locales/<code>/common.json
 * @returns The parsed translation namespace
 */
async function loadLocale(code: string): Promise<{ common: Record<string, unknown> }> {
  const response = await fetch(`/locales/${code}/common.json`);
  if (!response.ok) {
    throw new Error(`Missing locale file for "${code}"`);
  }
  return { common: (await response.json()) as Record<string, unknown> };
}

/**
 * Initialise i18next with lazy-loaded locale files.
 * English is bundled eagerly so the first render always has translations.
 * @returns Promise resolving once i18next is ready
 */
export async function initI18n(): Promise<typeof i18next> {
  const en = await loadLocale('en');

  await i18next.use(initReactI18next).init({
    resources: { en },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: languageCodes,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });

  return i18next;
}

/**
 * Switch the active language at runtime, loading its locale file if needed.
 * @param code - Language code to switch to
 */
export async function changeLanguage(code: string): Promise<void> {
  if (!i18next.hasResourceBundle(code, 'common')) {
    const bundle = await loadLocale(code);
    i18next.addResourceBundle(code, 'common', bundle.common, true, true);
  }
  await i18next.changeLanguage(code);
}
