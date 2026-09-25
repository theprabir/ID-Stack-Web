import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../public/locales/en/common.json';

// Initialise i18next for component tests with the English bundle.
void i18next.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

// jsdom does not implement matchMedia; components using prefers-color-scheme need it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  }),
});

// jsdom lacks IndexedDB; storageService tests mock the Dexie layer itself.
