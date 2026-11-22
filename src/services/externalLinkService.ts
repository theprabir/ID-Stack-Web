/**
 * External links (v0.7.6).
 *
 * The packaged Windows app runs in a Tauri webview, where `target="_blank"`
 * anchors do nothing — there is no browser tab to open. This helper routes
 * http(s) links through the OS default browser (tauri-plugin-opener) and falls
 * back to `window.open` on the Vite dev server.
 */
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { logMessage } from './appLog';

/** Only absolute http(s) URLs are ever handed to the OS */
export function isSafeExternalUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

/**
 * Open a link in the user's default browser.
 *
 * @param url - Absolute http(s) URL
 * @returns true when a browser was asked to open it
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  if (isTauri()) {
    try {
      await openUrl(url);
      return true;
    } catch (error) {
      logMessage('warn', `Could not open ${url}: ${String(error)}`);
      return false;
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
