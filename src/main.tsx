import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/common';
import './index.css';

/**
 * Boot the application:
 * 1. Register the PWA service worker
 * 2. Render inside ThemeProvider + ErrorBoundary
 */
async function bootstrap(): Promise<void> {
  // PWA: auto-update service worker (vite-plugin-pwa virtual module).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }

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
