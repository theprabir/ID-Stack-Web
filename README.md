<div align="center">

<img src="public/pwa-192x192.png" alt="ID Stack logo" width="128" />

# ID Stack

**Professional ID card design & batch printing — entirely in your browser.**

[![Live](https://img.shields.io/badge/live-id--stack.vercel.app-0078D4?logo=vercel&logoColor=white)](https://id-stack.vercel.app)
[![Version](https://img.shields.io/badge/version-0.6.15-6366f1)](https://github.com/theprabir/ID-Stack-Web/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

[**🌐 Launch the app**](https://id-stack.vercel.app) · [**📖 Changelog**](CHANGELOG.md) · [**🐛 Report an issue**](https://github.com/theprabir/ID-Stack-Web/issues)

No installation. No backend. No account. Your data never leaves your device.

</div>

---

## ✨ Features

### 🧩 PSD Workflow (the core)
- 📥 **PSD import** — layered Photoshop files via ag-psd; layer tree flattened per side with rasters + composite preview
- ✍️ **True text geometry** — placeholder text honours the PSD's real text box (box text wraps at the authored width, point text never width-wraps), engine transform origin, auto-leading (120 %), per-paragraph justification and the engine character stroke
- 🔤 **Exact font identity** — embedded PostScript names coalesced from the deduplicated engine data, matched against uploaded/bundled fonts (binary name-table aliases), preloaded via `document.fonts.load`; unmatched names fall back through humanised candidates (`ArialNarrow` → "Arial Narrow" → "Arial") instead of generic sans-serif
- 🪞 **Full typographic mirror** — engine Horizontal/Vertical Scale, baseline shift, ALL CAPS/small caps, strikethrough, tracking, leading, gradient overlay fills, strokes, shadows and glows mapped verbatim onto substituted text
- 📏 **Wrap-first text fitting** — multi-line fields wrap naturally within their authored line capacity (the box height is the line budget); overflow compression converges with wrapping (earlier lines absorb the words compression makes room for) and never drops below the 0.65 readability floor — no one-line barcodes, no orphaned words
- 🖼️ **Faithful photo placeholders** — centre-cropped, with the layer's original shadow/stroke/overlay/mask styling

### 📊 Data & Batch
- 📈 **Excel import** — .xlsx/.xls/.csv (SheetJS) with column mapping, auto-map and validation report (errors vs warnings per row)
- 📷 **Photo pipeline** — multi-photo import with filename/column auto-matching and manual assignment
- ⚡ **Batch generation** — hundreds of cards with progress bar, ETA, pause/resume/cancel and error list; CMYK JPEG encoding + DEFLATE run in a dedicated Web Worker
- 📦 **ZIP export** — one file per card with `{Name}_{ID}` / `{{Column}}` naming patterns
- 🎨 **CMYK export** — ICC-corrected CMYK JPEG (Adobe APP14 transform=0) and direct CMYK PDF (embedded ICC profile + GTS_PDFX OutputIntent)
- 🖨️ **Imposition engine** — N cards per sheet on A4/A3/Letter/Legal/Tabloid or custom paper (mm/cm/in/pt) with bleed, gap, margin, crop marks, positioned numbering and live sheet preview
- 👤 **One PDF per person** — double-sided cards export as a single 2-page PDF

### 🔐 Privacy & Platform
- 🧠 **100 % client-side** — no server, no API, no database, no accounts; everything runs in your browser
- 🌐 **Works offline (PWA)** — installable, service-worker cached
- 🔤 **Custom fonts** — upload .ttf/.otf/.woff/.woff2, persisted in IndexedDB, auto-matched to PSD layers; bundled Arial-compatible font (Arimo) included
- 🌗 **Dark & Light themes** — responsive from 1366×768 to 4K

## 🖥️ System Requirements
- Modern browser: Chrome 110+, Firefox 115+, Edge 110+, Safari 16+
- No installation required — runs on Windows, macOS, Linux

## 🚀 Quick Start
1. Open **[id-stack.vercel.app](https://id-stack.vercel.app)**
2. Upload your front/back PSD designs
3. Mark the text/photo layers as placeholders
4. Import your Excel data and photos, map the columns
5. Preview a live card, then generate the batch
6. Export as ZIP, print-ready imposed sheets, or per-person PDFs

## 📊 Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Project Foundation — Vite + React + TS strict, Tailwind/shadcn, routing, Zustand, layout, IndexedDB, PWA, ESLint/Prettier, Vitest | ✅ Complete |
| 3 | Data Import — Excel (SheetJS), photos, column mapping, validation | ✅ Complete |
| 4 | Batch Processing — Web Worker rendering, progress, pause/resume/cancel, ZIP export | ✅ Complete |
| 5 | PSD Import — ag-psd parsing, pixel-faithful re-composition, guided 3-step PSD Studio | ✅ Complete |
| 6 | Imposition Engine — sheet layout, numbering, print-ready PDF (pdf-lib), sheet preview | ✅ Complete |
| 7 | Polish & Production — font manager, error boundaries, performance, final testing, deployment | ✅ Complete |

> The legacy scratch editor and its template library were removed in v0.6.15 —
> ID Stack is now fully focused on pre-designed PSD files.

**Upcoming / incomplete:**
- 🌍 **All 11 UI language translations** — i18n was removed in v0.3.1; UI strings are currently English-only (the architecture's 11-language goal is not yet met)
- 🔢 **Barcode/QR rendering** — real QR/1D barcode drawing (qrcode + bwip-js) is not available in the output yet
- 🖼️ **Per-placeholder photo columns** — one photo is matched per row; per-placeholder photo mapping is not available

## 📖 Documentation

All guides live in the [`docs/`](docs/) folder — the in-app **Documentation**
page links to the same files:

| Document | For | Contents |
|---|---|---|
| [User manual](docs/user_manual.md) | Users | Every page and workflow: PSD Studio's 3 steps, output options, printing, privacy |
| [Developer manual](docs/developer_manual.md) | Contributors | Stack, architecture, services, data flow, PSD/CMYK/imposition internals, testing, releases |
| [Keyboard shortcuts](docs/keyboard_shortcuts.md) | Everyone | PSD Studio shortcut reference (implemented + planned) |
| [Troubleshooting guide](docs/troubleshooting.md) | Users | Symptom-first fixes: parsing, fonts, data, generation, printing, storage |

## 🛠️ For Developers

### Prerequisites
- Node.js 18+
- npm (bundled with Node.js)

### Installation
```bash
git clone https://github.com/theprabir/ID-Stack-Web.git
cd ID-Stack-Web
npm install
```

### Run the App (Development)
Starts the dev server with hot reload, then open **http://localhost:5173/** in your browser:
```bash
npm run dev
```
Stop the server with `Ctrl+C`.

### Full Command Reference

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload — http://localhost:5173/ |
| `npm run build` | Type-checks + builds production files to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the test suite once |
| `npm run test:watch` | Runs tests in watch mode |
| `npm run test:coverage` | Runs tests with a coverage report |
| `npm run typecheck` | TypeScript check only (no output files) |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint check with auto-fix |
| `npm run format` | Formats source files with Prettier |
| `npm run format:check` | Verifies Prettier formatting without changing files |

### Deploy
Push to `main` — auto-deploys to Vercel → **https://id-stack.vercel.app**

## 🙏 Acknowledgments
Built with React + TypeScript, SheetJS, ag-psd, pdf-lib, Tailwind CSS + shadcn/ui, Vite — and Web Workers for the heavy lifting.

## 📄 License
MIT License — see [LICENSE](LICENSE).

## 🐛 Reporting Issues & Support
Use [GitHub Issues](https://github.com/theprabir/ID-Stack-Web/issues) to report bugs or request features, or contact the maintainer: **Prabir kumar Das** ([@theprabir](https://github.com/theprabir)).
