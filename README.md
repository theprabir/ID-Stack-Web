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
**Current Phase:** 2.1 (Editor UX polish) — COMPLETE
**Status:** v0.2.1 — shortcuts, drag-drop layers, streamlined header

### Completed
- Phase 0 — Initialization: `README.md`, `LICENSE`, `.gitignore`
- Phase 1 — Project Foundation: Vite + React + TS strict, Tailwind themes, Zustand, i18n (11 languages), layout, Dexie/IndexedDB, PWA, ESLint/Prettier, Vitest
- **Phase 2 — Template Editor:**
  - Fabric.js 6 canvas with zoom (Ctrl+wheel, buttons, 10%–400%), Alt+drag pan, selection sync
  - Element tools: text, image, shape (rect/circle), barcode (as labelled box until Phase 3 wiring), `{{placeholder}}` with visual dashed border
  - Layers panel: visibility, lock, delete, select; top-first ordering
  - Context-sensitive properties panel: name, X/Y/width/height/rotation (mm), text options (font, size, weight, align, underline), fill, stroke + width, opacity slider, full shadow editor (color/blur/offsets/toggle)
  - Undo/redo history (50-step cap) with redo-stack invalidation and keyboard shortcuts (Ctrl+Z/Y, Ctrl+S, Delete, Esc)
  - Dual-sided templates: Front/Back tabs with independent element sets
  - `templateService`: create/save/load/delete/duplicate/list via IndexedDB
  - Editor i18n strings in all 11 languages
- **v0.2.1 — Editor UX polish:**
  - Photoshop-style keyboard shortcuts (implemented features only): tools V/T/U/H, zoom Ctrl+±/0/1, save Ctrl+S, undo/redo, select all/deselect, layer ordering Ctrl+[/] (+Shift), arrow-key nudging (Shift = 10 px)
  - Spacebar temporary-pan + middle-click canvas panning
  - Drag-drop layer reordering in the Layers panel with full undo/redo
  - Header simplified: logo + language + theme toggle (navigation lives in the sidebar)
  - `docs/keyboard_shortcuts.md` — all active and planned shortcuts

### Working Features
- All Phase 1 features (themes, languages, routing, PWA)
- Add/select/move/resize elements on a CR80 canvas; edit all properties live
- Undo/redo round-trips verified in browser
- Save to IndexedDB verified (template record with elements persisted)
- Front/back side isolation verified
- Full keyboard workflow and layer drag-drop verified in browser

### Known Issues
- Barcode elements render as labelled boxes — real QR/1D rendering lands with data binding (Phase 3/4)
- Bundle grew to ~161 KB gzipped (Fabric.js); still well under the 500 KB budget
- Layer rename is available via properties panel only; drag-drop layer reordering arrives with richer history UX later

### Next Steps
- **Phase 3 — Data Import:** SheetJS Excel parsing, photo import/matching, column mapping UI, validation, live preview

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
