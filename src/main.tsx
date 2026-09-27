import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/common';
import { bootstrapFonts } from './services/fontService';
import './index.css';

/**
 * Boot the application:
 * 1. Register the PWA service worker
 * 2. Restore persisted + bundled fonts BEFORE first render (placeholder
 *    text must measure/paint with the PSD's exact fonts, never a fallback)
 * 3. Render inside ThemeProvider + ErrorBoundary
 */
async function bootstrap(): Promise<void> {
  // PWA: auto-update service worker (vite-plugin-pwa virtual module).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }

  // Font registry ready before React mounts: uploaded fonts from IndexedDB
  // + bundled Arial-compatible faces. Canvas text then measures and paints
  // with the correct family on the FIRST pass.
  await bootstrapFonts();

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void bootstrap();
