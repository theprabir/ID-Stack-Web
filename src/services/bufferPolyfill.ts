/**
 * Browser Buffer polyfill (v0.4.2).
 * jpeg-js references Node's global Buffer; Vite serves it in the browser via
 * the `buffer` package. Import this module BEFORE jpeg-js anywhere in the app.
 */
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export {};
