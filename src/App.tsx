import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header, Sidebar, Footer, ErrorBoundary } from '@/components/common';
import { PsdStudioPage } from '@/pages/PsdStudioPage';
import { EditorPage } from '@/pages/EditorPage';
import { DataImportPage } from '@/pages/DataImportPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage } from '@/pages/AboutPage';

/**
 * Root application: layout (Header/Sidebar/Footer) + routed pages.
 */
export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-surface-deepest text-foreground transition-colors duration-300">
        <Header />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="themed-scrollbar min-w-0 flex-1 overflow-auto bg-surface-canvas transition-colors duration-300">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<PsdStudioPage />} />
                <Route path="/editor" element={<EditorPage />} />
                <Route path="/data" element={<DataImportPage />} />
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
