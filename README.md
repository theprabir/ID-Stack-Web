<div align="center">

<img src="public/pwa-192x192.png" alt="ID Stack logo" width="128" />

# ID Stack

**Professional ID card design & batch printing — a fully offline Windows desktop application.**

[![Downloads](https://img.shields.io/github/v/release/theprabir/id-stack-web?label=download&color=0078D4)](https://github.com/theprabir/id-stack-web/releases/latest)
[![Version](https://img.shields.io/badge/version-0.7.7-6366f1)](https://github.com/theprabir/id-stack-web/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

[**⬇️ Download for Windows**](https://github.com/theprabir/id-stack-web/releases/latest) · [**📖 Changelog**](CHANGELOG.md) · [**🐛 Report an issue**](https://github.com/theprabir/id-stack-web/issues)

Installs once. Runs offline. No backend, no account — your data never leaves your PC.

</div>

---

## ✨ Features

### 🧩 PSD Workflow (the core)
- 📥 **PSD import** — layered Photoshop files via ag-psd; layer tree flattened per side with rasters + composite preview
- ✍️ **True text geometry** — placeholder text honours the PSD's real text box (box text wraps at the authored width, point text never width-wraps), engine transform origin, auto-leading (120 %), per-paragraph justification and the engine character stroke
- 🔤 **Exact font identity** — embedded PostScript names coalesced from the deduplicated engine data, matched against uploaded/bundled fonts (binary name-table aliases), preloaded via `document.fonts.load`; unmatched names fall back through humanised candidates (`ArialNarrow` → "Arial Narrow" → "Arial") instead of generic sans-serif
- 🕉️ **Legacy (Akruti/Odia) font support** — uploaded fonts register under their **real internal name** parsed from the font's name table (never the file name), a strict `FontFace` guard awaits loading before every `fillText` (no fallback flicker), and PDFs embed the raw uploaded buffer — legacy-encoded Odia/Devanagari prints correctly on any device
- 🪞 **Full typographic mirror** — engine Horizontal/Vertical Scale, baseline shift, ALL CAPS/small caps, strikethrough, tracking, leading, gradient overlay fills, strokes, shadows and glows mapped verbatim onto substituted text
- 📏 **Wrap-first text fitting** — multi-line fields wrap naturally within their authored line capacity (the box height is the line budget); overflow compression converges with wrapping (earlier lines absorb the words compression makes room for) and never drops below the 0.65 readability floor — no one-line barcodes, no orphaned words
- 🖼️ **Faithful photo placeholders** — centre-cropped, with the layer's original shadow/stroke/overlay/mask styling

### 📊 Data & Batch
- 📈 **Excel import** — .xlsx/.xls/.csv (SheetJS) with column mapping, weighted fuzzy **Auto-map** (exact/substring/synonym/keyword scoring with a synonym dictionary) and a validation report (errors vs warnings per row)
- 📷 **Photo pipeline** — multi-photo import with filename/column auto-matching and manual assignment
- ⚡ **Batch generation** — hundreds of cards with progress bar, ETA, pause/resume/cancel and error list; CMYK JPEG encoding + DEFLATE run in a dedicated Web Worker
- 🌙 **Runs safely in the background** — minimize the window or lock Windows mid-run: the loop keeps going (background throttling disabled, sleep blocked while the job runs) and the taskbar button shows live progress
- 📦 **ZIP export** — one file per card with `{Name}_{ID}` / `{{Column}}` naming patterns
- 🗂️ **Native "Save as" dialogs** — every export (ZIP, imposed PDFs, CSV, diagnostics) asks where to save, remembers that folder, and offers **Open folder** afterwards; Settings lists the last 12 exports with their paths, so files never silently vanish into Downloads
- 🎨 **CMYK export** — ICC-corrected CMYK JPEG (Adobe APP14 transform=0) and direct CMYK PDF (embedded ICC profile + GTS_PDFX OutputIntent)
- 🖨️ **Imposition engine** — N cards per sheet on A4/A3/Letter/Legal/Tabloid or custom paper (mm/cm/in/pt) with bleed, gap, margin, crop marks and positioned card numbering
- 📐 **Exact print size — no scaling, ever** — each card prints at its own physical size (pixels ÷ DPI), placed 1:1 on its trim slot; the bleed setting only extends the edge pixels outwards (repeated at 1:1), so a 3 mm bleed no longer enlarges an 86 mm card. Crop marks sit on the real cut line
- 🗂️ **Sheet thumbnails, page navigation & zoom** — every imposed sheet is a clickable thumbnail; jump to a page, zoom 50–300 %, or fit to the panel
- 🔍 **Trim / safe-area proof overlay** — one toggle draws the trim (cut) line and the 3 mm safe area on the preview, so you see exactly what gets cut and what must stay inside. Guides are preview-only: the exported PDF contains cards, crop marks and numbering — never the blue box
- 🔢 **Card numbering — per sheet or continuous** — number each card (never the page): *Per sheet* restarts 1–N on every sheet, *Continuous* carries the sequence through the job and split PDF parts, and a record's front and back always print the same number. The preview shows the exact sequence that prints
- 🧠 **Memory-safe sheet output for huge jobs** — sheet pages are streamed: each card is encoded to CMYK JPEG the moment its page closes and its canvas is released, the PDF is rotated at a fixed byte budget, and very large jobs are written as numbered PDFs (`sheet_Print_part1of3.pdf`, …) instead of exhausting memory
- 🔤 **Per-field font override** — assign any uploaded font to any text placeholder from the layer list (independent of the PSD's embedded font name); "PSD font" keeps the automatic matching behaviour
- 👤 **One PDF per person** — double-sided cards export as a single 2-page PDF
- 🔢 **Barcode/QR placeholders** — pick any image layer as a barcode (EAN-13 default, Code 128, QR via bwip-js) with per-placeholder colours, background and an enable toggle; symbols are sized to the exact placeholder box
- 🩹 **Missing-photo workflow** — records without a photo render a fully transparent image area (never a demo photo; the frame layer beneath it is hidden too), Step 4 can include or exclude them (default on), and a one-click CSV export lists exactly which records still need photos

### 🔐 Privacy & Platform
- 🧠 **100 % local** — no server, no API, no database, no accounts; every byte stays on your PC
- ✈️ **Fully offline** — all assets are bundled into the app; no internet connection is ever needed, not even on first launch
- 🖥️ **Native Windows app** — installable `.msi` / setup `.exe` plus a portable `.exe`, built with Tauri v2 (native window, taskbar icon, no browser chrome); a second launch focuses the running window and the window size/position/maximized state is remembered
- 🩺 **Local diagnostics** — a rotating size-capped log (release builds included) and a one-click **Export diagnostics** ZIP (log, versions, WebView2, settings snapshot) for bug reports. No telemetry, no network
- 🔤 **Custom fonts** — upload .ttf/.otf/.woff/.woff2, persisted locally, auto-matched to PSD layers; bundled Arial-compatible font (Arimo) included
- 🌗 **Dark & Light themes** — responsive from 1366×768 to 4K

## 🖥️ System Requirements
- **Windows 10 or Windows 11, 64-bit**
- Microsoft **WebView2 Runtime** — preinstalled on Windows 11 and most updated Windows 10 machines; if it is missing, install it once (the setup executable can download it when online)
- ~50 MB disk space; no other dependencies, no admin rights needed for the per-user setup

## 🚀 Quick Start
1. Go to **[Releases](https://github.com/theprabir/id-stack-web/releases/latest)** and download the installer:
   - `ID Stack_<version>_x64-setup.exe` — per-user setup (recommended)
   - `ID Stack_<version>_x64_en-US.msi` — MSI for managed / silent installs
   - `ID Stack.exe` — portable; run it from any folder, nothing to install
2. Launch **ID Stack** from the Start menu (or the portable `.exe`).
3. *(fastest)* Click **Open demo project** in Step 1 — a sample employee card (front + back PSDs + Excel + photos) loads fully wired and lands on the pre-filled placeholder step, so you can walk the workflow yourself
4. Upload your front/back PSD designs
5. Mark the text/photo layers as placeholders
6. Import your Excel data and photos, map the columns
7. Preview a live card, then generate the batch
8. Export as ZIP, print-ready imposed sheets, or per-person PDFs

The app works with no internet connection at any point — downloading it is the only time the network is used.

## 📊 Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Project Foundation — Vite + React + TS strict, Tailwind/shadcn, routing, Zustand, IndexedDB, ESLint/Prettier, Vitest | ✅ Complete |
| 3 | Data Import — Excel (SheetJS), photos, column mapping, validation | ✅ Complete |
| 4 | Batch Processing — Web Worker rendering, progress, pause/resume/cancel, ZIP export | ✅ Complete |
| 5 | PSD Import — ag-psd parsing, pixel-faithful re-composition, guided 4-step ID Studio | ✅ Complete |
| 6 | Imposition Engine — sheet layout, numbering, print-ready PDF (pdf-lib), sheet preview | ✅ Complete |
| 7 | Polish & Production — font manager, error boundaries, performance, final testing, Windows desktop packaging | ✅ Complete |

> The legacy scratch editor and its template library were removed in v0.6.15 —
> ID Stack is now fully focused on pre-designed PSD files.

## 📖 Documentation

All guides live in the [`docs/`](docs/) folder and are bundled into the app —
the in-app **Documentation** page renders them right there, offline:

| Document | For | Contents |
|---|---|---|
| [User manual](docs/user_manual.md) | Users | Installation, every page and workflow: ID Studio's 4 steps, output options, printing, privacy |
| [Developer manual](docs/developer_manual.md) | Contributors | Stack, architecture, services, data flow, PSD/CMYK/imposition internals, testing, desktop releases |
| [Keyboard shortcuts](docs/keyboard_shortcuts.md) | Everyone | ID Studio shortcut reference (implemented + planned) |
| [Troubleshooting guide](docs/troubleshooting.md) | Users | Symptom-first fixes: startup, parsing, fonts, data, generation, printing, storage |

## 🛠️ For Developers

### Prerequisites
- Node.js 18+
- npm (bundled with Node.js)
- **Rust** (stable toolchain via [rustup](https://rustup.rs)) and the **Visual Studio C++ Build Tools** (MSVC linker) — needed only for the desktop build

### Installation
```bash
git clone https://github.com/theprabir/id-stack-web.git
cd id-stack-web
npm install
```

### Desktop Development
Starts the Tauri window against the Vite dev server on port 5210, with hot reload:
```bash
npm run tauri dev
```
`npm run dev` alone still serves the UI at `http://localhost:5173` in a browser —
handy for quick UI work, but it is **not** how the app is delivered.

### Build the Installers
```bash
npm run tauri build
```
Build artifacts:
- `src-tauri/target/release/ID Stack.exe` — portable executable
- `src-tauri/target/release/bundle/msi/*.msi` — MSI installer
- `src-tauri/target/release/bundle/nsis/*-setup.exe` — setup executable

The desktop shell bundles all app assets locally (no internet required at
runtime), disables the context menu, internal dragging, reload/zoom shortcuts
and devtools in release builds, and keeps external file drag-and-drop working
via `dragDropEnabled: false`. `npm run tauri` runs the CLI through
`scripts/tauri-cli.mjs`, which supplies the MSVC `INCLUDE`/`LIB`/`PATH`
environment when the machine has no working `vcvars64.bat`.

The `bundle.windows.webviewInstallMode` option in `src-tauri/tauri.conf.json`
can be set to `offlineInstaller` to embed a ~127 MB WebView2 bootstrapper in the
installer, for machines that have neither WebView2 nor internet access.

### Full Command Reference

| Command | What it does |
|---|---|
| `npm run tauri dev` | Runs the desktop app with hot reload (port 5210) |
| `npm run tauri build` | Builds the Windows `.exe` and `.msi`/`-setup.exe` installers |
| `npm run dev` | Browser dev server with hot reload — http://localhost:5173/ (development only) |
| `npm run build` | Type-checks + builds the frontend files to `dist/` |
| `npm run preview` | Serves the built frontend locally (development only) |
| `npm test` | Runs the test suite once |
| `npm run test:watch` | Runs tests in watch mode |
| `npm run test:coverage` | Runs tests with a coverage report |
| `npm run typecheck` | TypeScript check only (no output files) |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint check with auto-fix |
| `npm run format` | Formats source files with Prettier |
| `npm run format:check` | Verifies Prettier formatting without changing files |

### Releases
ID Stack is distributed **only** as a Windows desktop app through
[GitHub Releases](https://github.com/theprabir/id-stack-web/releases). There is
no hosted web version.

1. Build with `npm run tauri build`.
2. Create a GitHub Release for the version and attach:
   - `src-tauri/target/release/bundle/nsis/*-setup.exe`
   - `src-tauri/target/release/bundle/msi/*.msi`
   - `src-tauri/target/release/ID Stack.exe` (portable, optional)
3. Users download, install (or run the portable `.exe`) and work entirely offline.

## 🙏 Acknowledgments
Built with React + TypeScript, Tauri v2, SheetJS, ag-psd, pdf-lib, Tailwind CSS + shadcn/ui, Vite — and Web Workers for the heavy lifting.

## 📄 License
MIT License — see [LICENSE](LICENSE).

## 🐛 Reporting Issues & Support
Use [GitHub Issues](https://github.com/theprabir/id-stack-web/issues) to report bugs or request features, or contact the maintainer: **Prabir kumar Das** ([@theprabir](https://github.com/theprabir)).
