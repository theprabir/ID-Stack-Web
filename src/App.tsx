import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header, Sidebar, Footer, ErrorBoundary } from '@/components/common';
import { EditorPage } from '@/pages/EditorPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage } from '@/pages/AboutPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { changeLanguage } from '@/i18n';

/**
 * Root application: layout (Header/Sidebar/Footer) + routed pages.
 * Assumes i18n has been initialised before render (see main.tsx).
 */
export default function App(): JSX.Element {
  const language = useSettingsStore((state) => state.language);
  const { i18n } = useTranslation();

  // Apply the stored language on startup (locale bundle loads on demand).
  useEffect(() => {
    if (language && i18n.language !== language) {
      void changeLanguage(language);
    }
  }, [language, i18n]);

  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-surface-deepest text-foreground transition-colors duration-300">
        <Header />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="themed-scrollbar min-w-0 flex-1 overflow-auto bg-surface-canvas transition-colors duration-300">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<EditorPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
