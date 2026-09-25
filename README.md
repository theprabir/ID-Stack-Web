# ID Stack — ID Card Design & Batch Printing Software

## 🎯 Overview
**ID Stack** is a professional, open-source ID card design and batch printing software that runs entirely in your browser. No installation, no backend, no server. Just open the URL and start designing.

## ✨ Features
- Photoshop-like template editor with layers, effects, and precision tools
- Dual-sided templates (Front + Back)
- Excel data import with placeholder mapping
- Batch photo import with auto-matching
- Batch generation of hundreds of ID cards in seconds
- PSD file import (Photoshop designs)
- Pre-designed template library
- Print-ready PDF export with imposition (multiple cards per sheet)
- Same-sheet duplex layout (fronts row 1, backs row 2)
- 3 numbering modes (per-sheet, continuous, none)
- Custom font upload + bundled web fonts
- Drop shadows, strokes, borders, and other effects
- Dark and Light theme support
- 11 languages: English, Hindi, Marathi, Odia, Bengali, Tamil, Telugu, Kannada, Gujarati, Punjabi, Spanish
- Works offline (PWA)
- 100% client-side — your data never leaves your device

## 🖥️ System Requirements
- Modern browser: Chrome 110+, Firefox 115+, Edge 110+, Safari 16+
- No installation required
- Works on Windows, macOS, Linux

## 🌐 Live Demo
[Deploy to Vercel/Netlify and add link here]

## 🚀 Quick Start
1. Open the app URL
2. Create a new template or choose from the library
3. Design front and back sides
4. Import Excel data
5. Import photos
6. Generate ID cards
7. Export as individual files or print-ready PDF

## 📖 Documentation
See the `docs/` folder for:
- User manual
- Keyboard shortcuts
- Troubleshooting guide

## 🛠️ For Developers

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Installation
```bash
git clone https://github.com/theprabir/ID-Stack-Web.git
cd ID-Stack-Web
pnpm install
```

### Development
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Deploy
Push to main branch — auto-deploys to Vercel/Netlify.

## 🌍 Supported Languages
English, Hindi (हिंदी), Marathi (मराठी), Odia (ଓଡ଼ିଆ), Bengali (বাংলা), Tamil (தமிழ்), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), Spanish (Español)

## 📄 License
MIT License - see LICENSE file

## 🤝 Contributing
Contributions welcome! Please read the guidelines before submitting PRs to [theprabir/ID-Stack-Web](https://github.com/theprabir/ID-Stack-Web).

## 🐛 Reporting Issues
Use [GitHub Issues](https://github.com/theprabir/ID-Stack-Web/issues) to report bugs or request features.

## 📊 Project Status
**Current Phase:** 1 (Project Foundation) — COMPLETE
**Status:** Foundation implemented, tested and verified

### Completed
- Phase 0 — Initialization: `README.md`, `LICENSE`, `.gitignore`
- **Phase 1 — Project Foundation:**
  - Vite 5 + React 18 + TypeScript (strict mode) toolchain
  - Tailwind CSS 3 with `darkMode: 'class'` and full dark/light theme tokens
  - shadcn/ui-style base components (Button, Card, Select, Checkbox, Label)
  - React Router with 4 pages: Editor, Library, Settings, About
  - Zustand stores: `uiStore` (theme, layout) and `settingsStore` (language, units, auto-save), both persisted
  - **Theme system:** `ThemeProvider`, `useTheme` hook, sun/moon toggle in Header, OS-preference detection on first visit, persistence in localStorage **and** IndexedDB, 300 ms transitions
  - **i18n (i18next):** all 11 languages (en, hi, mr, or, bn, ta, te, kn, gu, pa, es) with lazy-loaded locale files and runtime switching
  - Main layout: Header (nav + language switcher + theme toggle), collapsible Sidebar, Footer status bar
  - **IndexedDB via Dexie.js:** `storageService` with key-value, templates and fonts tables
  - **PWA (vite-plugin-pwa):** manifest, generated icons, service worker with auto-update, offline caching
  - ESLint + Prettier configured; Vitest + React Testing Library + fake-indexeddb test setup
  - Error boundary wrapping all routes

### Working Features
- Dark/light theme toggle with persistence (verified in browser in both themes)
- Language switching across all 11 locales with persistence (verified with Hindi)
- Client-side routing between all pages
- PWA installs a service worker and precaches assets (verified in production build)
- Template/font/settings persistence layer ready for later phases

### Known Issues
- One benign ESLint warning (`react-refresh/only-export-components` in `button.tsx` due to barrel-style variant export)
- Editor/Library pages are placeholders pending Phases 2 and 5

### Next Steps
- **Phase 2 — Template Editor:** Fabric.js canvas, tools/layers/properties panels, history (undo/redo), template save/load, effects (shadow, stroke, fill)

## 🙏 Acknowledgments
Built with:
- React + TypeScript
- Fabric.js (canvas editor)
- SheetJS (Excel parsing)
- ag-psd (PSD import)
- pdf-lib (PDF generation)
- i18next (internationalization)
- Tailwind CSS + shadcn/ui (UI)
- Vite (build tool)

## 📞 Support
Open an issue on [GitHub Issues](https://github.com/theprabir/ID-Stack-Web/issues) or contact the maintainer: **Prabir kumar Das** ([@theprabir](https://github.com/theprabir)).
