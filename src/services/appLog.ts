/**
 * Frontend → rotating log file bridge (v0.7.5).
 *
 * The Rust side runs `tauri-plugin-log` in release builds too, writing a
 * size-capped file in the app log folder. Messages from the UI go through the
 * same logger so a user's report ("it went blank") can be matched against
 * what the app was doing at that moment. Nothing is sent anywhere: the file
 * stays on this PC until the user exports diagnostics themselves.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';

/** Log severity understood by the Rust `log_message` command */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Write one message to the persistent app log.
 *
 * Never throws: logging must not be able to break a workflow, and in the
 * browser build (the Vite dev server) it simply stays in the console.
 */
export function logMessage(level: LogLevel, message: string): void {
  if (isTauri()) {
    void invoke('log_message', { level, message }).catch(() => undefined);
  }
  if (import.meta.env.DEV) {
    console[level](`[id-stack] ${message}`);
  }
}

/**
 * Capture uncaught errors and unhandled rejections into the log, so a release
 * build with no devtools still records why the UI broke. Installed once at
 * bootstrap.
 */
export function installGlobalErrorLogging(): void {
  window.addEventListener('error', (event) => {
    const location = event.filename ? ` (${event.filename}:${event.lineno})` : '';
    logMessage('error', `Unhandled error: ${event.message}${location}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const detail =
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason ?? 'unknown');
    logMessage('error', `Unhandled promise rejection: ${detail}`);
  });
}
