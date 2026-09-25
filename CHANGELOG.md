# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-09-25

### Added
- Photoshop-style keyboard shortcuts for all implemented editor features: tool pickers (V/T/U/H), zoom (Ctrl+/-/0/1), save (Ctrl+S), undo/redo (Ctrl+Z/Y/Shift+Z), select all/deselect (Ctrl+A/D), layer ordering (Ctrl+[/]/Shift), arrow-key nudging (Shift = 10 px)
- Spacebar temporary-pan (grab cursor) and middle-click canvas panning
- Drag-drop layer reordering in the Layers panel with full undo/redo support
- `docs/keyboard_shortcuts.md` documenting every active shortcut and planned ones

### Changed
- Header simplified to logo + language switcher + theme toggle; page navigation now lives only in the left sidebar

## [0.2.0] - 2026-09-25

### Phase 2 — Template Editor

### Added
- Fabric.js 6 canvas editor: zoom (Ctrl+wheel, buttons, 10%–400%), Alt+drag pan, multi-select
- Element tools: text, image, shape (rectangle/circle), barcode, `{{placeholder}}` (dashed visual indicator)
- ToolsPanel: element creation, quick shapes, background color, new/save template
- LayersPanel: visibility toggle, lock/unlock, delete, per-layer select, top-first ordering
- PropertiesPanel: name, X/Y/width/height/rotation (mm), text properties (font/size/weight/align/underline), fill color, stroke + width, opacity, full shadow editor (enable/color/blur/offset X/Y), reset effects
- useHistory hook: snapshot undo/redo, 50-step cap, jump-capable labels, redo-stack invalidation
- Dual-sided templates with Front/Back tabs and independent element sets
- templateService: create/save/load/delete/duplicate/list, element upsert/remove via IndexedDB (Dexie)
- Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+S save, Delete/Backspace remove, Esc deselect
- Editor i18n strings across all 11 languages
- Tests: templateService CRUD (7), useHistory (4), units (4) — 36 total
- About page Credits section (ID Stack, Prabir kumar Das @theprabir, GitHub repo link)

### Fixed
- Canvas API instance shared via props (EditorPage ↔ CanvasEditor) so tool actions affect the real canvas

## [0.1.1] - 2026-09-25

### Changed
- Project rebranded to **ID Stack** (author: Prabir kumar Das, [@theprabir](https://github.com/theprabir))
- Repository URL set to `https://github.com/theprabir/ID-Stack-Web`
- App name updated in PWA manifest, `index.html`, package metadata and all 11 locale files (app.name)
- MIT LICENSE copyright holder set to "Prabir kumar Das"
- Persisted storage keys renamed: `id-stack-ui-preferences`, `id-stack-settings`, IndexedDB database `id-stack`
- README updated with repository links, issue tracker and maintainer contact

## [0.1.0] - 2026-09-25

### Phase 1 — Project Foundation

### Added
- Vite 5 + React 18 + TypeScript (strict) project toolchain with `@` path alias
- Tailwind CSS 3 (`darkMode: 'class'`) with dark/light theme tokens per Design.md palette
- shadcn/ui-style UI primitives: Button, Card, Select, Checkbox, Label
- Theme system: `ThemeProvider`, `useTheme` hook, `uiStore` theme state, Header sun/moon toggle, OS-preference detection, localStorage + IndexedDB persistence, 300 ms transitions
- Zustand stores: `uiStore` (theme/layout/loading) and `settingsStore` (language/units/auto-save), both persisted
- i18n via i18next + react-i18next: 11 languages (en, hi, mr, or, bn, ta, te, kn, gu, pa, es) with lazy-loaded `public/locales/<code>/common.json` and runtime switching
- Main layout: Header (nav, language switcher, theme toggle, loading indicator), collapsible Sidebar, Footer status bar
- Pages: Editor (placeholder), Library (placeholder), Settings (language, units, auto-save, theme), About
- `storageService` on Dexie.js: key-value, templates and fonts tables
- PWA: vite-plugin-pwa manifest, generated 192/512 px icons + favicon, Workbox service worker with auto-update and Google Fonts runtime caching
- Error boundary wrapping all routes
- ESLint (TS + react-hooks + prettier) and Prettier configs
- Vitest + React Testing Library + jsdom + fake-indexeddb test setup
- 21 unit/component tests: uiStore, settingsStore, storageService, ThemeProvider, Header
- PWA icon generator script (`scripts/generate-icons.mjs`, zero dependencies)
