/**
 * Native desktop shell behaviour (Tauri v2).
 *
 * The app ships as a Windows desktop build; none of these guards run in a
 * browser (the Vite dev server), so they only apply to the packaged product: they
 * only apply when the app is hosted inside the Tauri webview. They remove the
 * browser affordances that make a desktop build feel like a web page:
 *
 * - the right-click context menu and internal element dragging,
 * - browser reload / zoom shortcuts (F5, Ctrl+R, Ctrl+±/0 and Ctrl+wheel),
 * - file navigation when a file is dropped outside an app dropzone.
 *
 * External file drops delivered by the OS never fire `dragstart` in the page,
 * so blocking internal drags does not affect HTML5 `onDrop` handlers.
 */
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openExternal } from './externalLinkService';

/** Ctrl/Cmd combinations that the desktop shell owns instead of the webview */
const BLOCKED_CTRL_KEYS = new Set(['r', 'R', '+', '=', '-', '_', '0']);

/** True when the key event asks the webview to reload or change zoom */
function isBrowserShortcut(event: KeyboardEvent): boolean {
  if (event.key === 'F5') return true;
  if (!event.ctrlKey && !event.metaKey) return false;
  return BLOCKED_CTRL_KEYS.has(event.key);
}

/** Prevent default without stopping propagation, so app handlers still run */
function swallow(event: Event): void {
  event.preventDefault();
}

/**
 * Install the desktop-only shell guards. Safe to call in a browser: it is a
 * no-op unless the app is running inside Tauri.
 */
export function installDesktopShellGuards(): void {
  if (!isTauri()) return;

  window.addEventListener('contextmenu', swallow);
  window.addEventListener('dragstart', swallow);
  window.addEventListener('dragover', swallow);
  window.addEventListener('drop', swallow);

  // External links: the webview cannot open a new browser tab, so any
  // http(s) anchor (About, footer credit, guide source links, markdown) is
  // handed to the OS default browser instead (v0.7.6).
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!/^https?:/i.test(href)) return;
      event.preventDefault();
      void openExternal(href);
    },
    true
  );

  window.addEventListener(
    'keydown',
    (event) => {
      if (isBrowserShortcut(event)) event.preventDefault();
    },
    { capture: true }
  );

  // Ctrl+wheel zoom is handled by the webview before keydown, so it needs its
  // own non-passive listener.
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false }
  );
}

/**
 * Reveal the main window once React has mounted. The window is created with
 * `visible: false` to avoid the white startup flash; the Rust side shows it
 * after a short fallback delay if this call never happens.
 */
export async function revealDesktopWindow(): Promise<void> {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}
