/**
 * Shared LittleCMS WASM loader (v0.7.9).
 *
 * `@kittl/little-cms`'s `initWasm` keeps its Emscripten module in a module-level
 * variable but has no in-flight guard: two concurrent calls each start their
 * own module, fetch the 254 kB `lcms.wasm` twice, and whichever finishes last
 * overwrites the shared handle. Callers that already hold handles from the
 * other module then operate on a different instance — and under load one of
 * the duplicated fetches can fail, which surfaces as the near-useless
 * `Aborted(both async and sync fetching of the wasm failed)`.
 *
 * This module owns the ONLY call to `initWasm` per JavaScript realm (the main
 * thread, and each export worker separately) and adds:
 * - single flight: concurrent callers await one load instead of racing;
 * - retry: a transient asset fetch failure (dev-server restart, HMR window,
 *   brief network error) is retried with a cache-busting query parameter;
 * - a clear, actionable error when every attempt fails.
 */

import { initWasm } from '@kittl/little-cms';

/** Total load attempts before giving up */
const MAX_ATTEMPTS = 3;
/** Delay before attempt 2, doubled for attempt 3 */
const RETRY_DELAY_MS = 250;

/** True once the WASM module is instantiated in this realm */
let ready = false;
/** The in-flight (or failed-and-reset) load */
let pending: Promise<void> | null = null;

/** Wait between load attempts */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * URL for one attempt. A retry adds a query parameter so a failed response in
 * the browser's HTTP cache is not replayed to the next attempt.
 *
 * @param wasmUrl - Absolute URL of the bundled lcms.wasm
 * @param attempt - 1-based attempt number
 * @returns URL to load
 */
function attemptUrl(wasmUrl: string, attempt: number): string {
  if (attempt === 1) return wasmUrl;
  const separator = wasmUrl.includes('?') ? '&' : '?';
  return `${wasmUrl}${separator}lcmsAttempt=${attempt}`;
}

/**
 * Describe a failed load without heredoc-style noise from the WASM runtime.
 *
 * @param wasmUrl - URL that could not be loaded
 * @param error - Last error reported by the loader
 * @returns User-facing message
 */
function describeFailure(wasmUrl: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    `The colour engine (LittleCMS) could not load its WASM module from "${wasmUrl}". ` +
    `Reload the app and try again. (${detail})`
  );
}

/** True when the WASM module is ready in this realm */
export function isLittleCmsReady(): boolean {
  return ready;
}

/**
 * Load (once) the LittleCMS WASM module for this realm.
 *
 * Safe to call concurrently and repeatedly: the first caller starts the load,
 * later callers share it, and a failed load clears the slot so the next export
 * can try again.
 *
 * @param wasmUrl - Absolute URL of the bundled lcms.wasm
 * @throws Error when every attempt fails
 */
export function loadLittleCms(wasmUrl: string): Promise<void> {
  if (ready) return Promise.resolve();
  if (pending) return pending;

  const attempt = async (): Promise<void> => {
    let lastError: unknown = null;
    for (let number = 1; number <= MAX_ATTEMPTS; number += 1) {
      if (number > 1) await delay(RETRY_DELAY_MS * (number - 1));
      try {
        const result = await initWasm(attemptUrl(wasmUrl, number));
        if (!result.error) {
          ready = true;
          return;
        }
        lastError = result.error;
      } catch (error) {
        // `initWasm` normally reports failures as a Result, but a synchronous
        // throw (aborted module, CSP) must also count as a retryable attempt.
        lastError = error;
      }
    }
    throw new Error(describeFailure(wasmUrl, lastError));
  };

  pending = attempt().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Test hook: forget the loaded module (the next call loads again) */
export function resetLittleCmsLoader(): void {
  ready = false;
  pending = null;
}
