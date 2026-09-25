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

## 📄 License
MIT License - see LICENSE file

## 🤝 Contributing
Contributions welcome! Please read the guidelines before submitting PRs to [theprabir/ID-Stack-Web](https://github.com/theprabir/ID-Stack-Web).

## 🐛 Reporting Issues
Use [GitHub Issues](https://github.com/theprabir/ID-Stack-Web/issues) to report bugs or request features.

## 📊 Project Status
**Current Phase:** 3 (Data Import) — COMPLETE
**Status:** v0.3.1 — English-only UI (multi-language support removed); Excel import, photo matching, column mapping, validation, live card preview

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
  - Editor UI strings (English)
- **v0.2.1 — Editor UX polish:**
  - Photoshop-style keyboard shortcuts (implemented features only): tools V/T/U/H, zoom Ctrl+±/0/1, save Ctrl+S, undo/redo, select all/deselect, layer ordering Ctrl+[/] (+Shift), arrow-key nudging (Shift = 10 px)
  - Spacebar temporary-pan + middle-click canvas panning
  - Drag-drop layer reordering in the Layers panel with full undo/redo
  - Header simplified: logo + theme toggle (navigation lives in the sidebar)
  - `docs/keyboard_shortcuts.md` — all active and planned shortcuts
- **Phase 3 — Data Import:**
  - `excelService`: SheetJS parsing of .xlsx/.xls/.csv (first sheet, header row), duplicate-column dedupe, blank-row skipping, preview helpers
  - `photoService`: multi-photo import with blob URLs and dimensions, auto-matching by filename / Excel column / manual assignment, centre-crop+resize processing, blob cleanup
  - `previewService`: 2D-canvas card renderer with `{{Placeholder}}` substitution, word-wrapped text, image centre-crop, shapes, shadows/strokes
  - Placeholder collection from the template (placeholder elements + `{{Token}}` text) drives the mapping UI
  - `dataStore`: Excel data, photos, mappings, validation and match state with auto-map on import
  - Data Import page: ExcelImport, ColumnMapping, DataPreview (validation report + row picker), CardLivePreview, PhotoImport
  - Validation: missing required fields, duplicate IDs, missing photos, sparse rows, unmapped placeholders (errors vs warnings)
  - All UI strings in plain English (i18n removed in v0.3.1)

### Working Features
- All Phase 1 & 2 features (themes, routing, PWA, editor)
- Import .xlsx/.xls/.csv with auto-mapping of placeholders to columns
- Photo import with filename/column/manual auto-matching
- Validation report with error/warning severity per row
- Live card preview rendering any selected row onto the current template
- Excel → mapping → matching → validation → preview pipeline covered by an integration test

### Known Issues
- Barcode elements still render as labelled boxes in previews — real QR/1D rendering lands with batch generation (Phase 4)
- Photo placeholders render the matched photo by row (one photo per card); per-placeholder photo columns arrive with Phase 4
- Bundle grew to ~285 KB gzipped (Fabric.js + SheetJS); still under the 500 KB budget

### Next Steps
- **Phase 4 — Batch Processing:** Web Worker rendering, progress tracking, pause/resume/cancel, ZIP export

## 🙏 Acknowledgments
Built with:
- React + TypeScript
- Fabric.js (canvas editor)
- SheetJS (Excel parsing)
- ag-psd (PSD import)
- pdf-lib (PDF generation)
- Tailwind CSS + shadcn/ui (UI)
- Vite (build tool)

## 📞 Support
Open an issue on [GitHub Issues](https://github.com/theprabir/ID-Stack-Web/issues) or contact the maintainer: **Prabir kumar Das** ([@theprabir](https://github.com/theprabir)).
