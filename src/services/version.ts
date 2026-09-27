/**
 * Single source of truth for the app's display version.
 *
 * The value comes from package.json's `version` through Vite's
 * `__APP_VERSION__` define (vite.config.ts) — bump the version there (or
 * via `npm version …`) and every display surface (footer chip, About
 * page) updates automatically. No second copy to keep in sync.
 */
export const VERSION: string = __APP_VERSION__;
