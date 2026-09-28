# ID Stack — Developer Manual

Everything a developer needs to run, understand, extend and maintain ID
Stack: toolchain, architecture, data flow, storage, rendering pipeline,
testing and release process.

> **Companion documents:** [User manual](user_manual.md) ·
> [Keyboard shortcuts](keyboard_shortcuts.md) ·
> [Troubleshooting guide](troubleshooting.md)

---

## Table of contents

1. [Technology stack](#1-technology-stack)
2. [Getting started](#2-getting-started)
3. [Repository layout](#3-repository-layout)
4. [Application architecture](#4-application-architecture)
5. [State management (Zustand stores)](#5-state-management-zustand-stores)
6. [Services (the core logic)](#6-services-the-core-logic)
7. [Data flow](#7-data-flow)
8. [Storage: IndexedDB schema](#8-storage-indexeddb-schema)
9. [PSD pipeline internals](#9-psd-pipeline-internals)
10. [CMYK export engine](#10-cmyk-export-engine)
11. [Imposition engine](#11-imposition-engine)
12. [Font system](#12-font-system)
13. [Testing](#13-testing)
14. [Performance & memory rules](#14-performance--memory-rules)
15. [Code conventions](#15-code-conventions)
16. [Releases & deployment](#16-releases--deployment)

---

## 1. Technology stack

| Concern | Library | Notes |
|---|---|---|
| Framework | **React 18 + TypeScript (strict)** | Functional components + hooks only |
| Build | **Vite 5** | ES2022 target, `@` → `src/` alias |
| UI | **Tailwind CSS 3 + shadcn/ui-style primitives** | `darkMode: 'class'`, design tokens in `tailwind.config.ts` |
| Canvas editor | **Fabric.js 6** | Legacy template editor only |
| PSD parsing | **ag-psd 31** | Patched for CMYK (see [PSD pipeline](#9-psd-pipeline-internals)) |
| Excel parsing | **SheetJS (`xlsx`)** | First sheet, header row detection |
| PDF | **pdf-lib** | CMYK pages + GTS_PDFX OutputIntent |
| Colour | **@kittl/little-cms** (WASM) | sRGB → CMYK ICC transform; bundled Ghostscript `default_cmyk.icc` |
| JPEG | **jpeg-js** + custom APP14 patcher | True 4-component Adobe CMYK JPEG |
| ZIP | **jszip** | Batch packaging |
| Barcode/QR | `qrcode`, `bwip-js` | **Declared but not wired in** (barcode elements render labelled boxes) |
| State | **Zustand 5** | `persist` middleware where needed |
| Storage | **Dexie 4** (IndexedDB) | Database `id-stack` |
| PWA | **vite-plugin-pwa** (Workbox) | Auto-update SW, precache, Google Fonts runtime cache |
| Tests | **Vitest + Testing Library + jsdom + fake-indexeddb** | `tests/**/*.test.{ts,tsx}` |

### Hard architectural rules (from AGENTS.md)

- **Zero backend.** No server, API, database, auth or accounts. Everything
  executes client-side.
- No native dependencies; everything is JS/TS/WASM-in-browser.
- Heavy work must not block the main thread (yielding loops; a dedicated
  worker pool for JPEG encoding).
- No `any`; strict mode; ESLint + Prettier enforced.

---

## 2. Getting started

```bash
git clone https://github.com/theprabir/ID-Stack-Web.git
cd ID-Stack-Web
npm install
npm run dev        # http://localhost:5173/
```

### Command reference

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | `tsc --noEmit` (full typecheck) **then** production build to `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Coverage (v8 provider, HTML + text report) |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run lint` / `lint:fix` | ESLint (ts/tsx) |
| `npm run format` / `format:check` | Prettier over `src/**/*.{ts,tsx,css,json}` |

Node **≥ 18** required (`engines` in package.json).

### Vite config notes (`vite.config.ts`)

- `define.__APP_VERSION__` injects `package.json`'s version at build time —
  the single version source (consumed by `src/services/version.ts`).
- `resolve.alias`: `@` → `src`; **`ag-psd` →
  `node_modules/ag-psd/dist/psdReader.js`** so the CMYK patch and the app
  share one reader instance (see below).
- `optimizeDeps.include` pre-bundles that same deep CJS path.
- `worker.format: 'es'` — the export worker uses dynamic imports; IIFE would
  break the build.
- `build.rollupOptions.output.manualChunks`: react/react-dom/react-router in
  one chunk.
- Vitest block: jsdom environment, globals, `src/test/setup.ts`, coverage
  excludes UI primitives and `main.tsx`.

---

## 3. Repository layout

```
├── AGENTS.md / Architecture.md / Design.md / CHANGELOG.md
├── index.html                  # PWA entry
├── vite.config.ts              # build + test + PWA + aliases
├── tailwind.config.ts / postcss.config.js
├── sample-data/                # demo PSDs, employees.csv, photos/, fonts
├── scripts/                    # e.g. generate-icons.mjs (PWA icons)
├── tests/                      # Vitest suites (mirror src structure)
│   ├── services/  hooks/  stores/  utils/  components/
│   └── data-flow.test.ts       # Excel → template → cards integration
├── dist/                       # build output (gitignored)
└── src/
    ├── main.tsx                # bootstrap: SW + fonts → React
    ├── App.tsx                 # router + layout (Header/Sidebar/Footer)
    ├── index.css               # Tailwind layers + theme tokens
    ├── assets/fonts/           # bundled Arimo faces (Arial-metric)
    ├── assets/profiles/        # default_cmyk.icc + lcms.wasm
    ├── components/
    │   ├── common/   # Header, Sidebar, Footer, ErrorBoundary, LoadingSpinner
    │   ├── ui/       # shadcn-style primitives (Button, Input, Select, …)
    │   ├── editor/   # legacy Fabric editor UI (8 components)
    │   ├── data/     # ExcelImport, PhotoImport, ColumnMapping, DataPreview,
    │   │             # CardLivePreview
    │   └── psd/      # PsdUploader, LayerPicker, PsdCardPreview, BatchRunner,
    │                 # ImpositionPanel, FontManager, StudioStepper
    ├── pages/        # PsdStudioPage (/), EditorPage, LibraryPage,
    │                 # SettingsPage, AboutPage
    ├── stores/       # Zustand: psdStore, dataStore, templateStore,
    │                 # canvasStore, settingsStore, uiStore
    ├── services/     # business logic (see §6) — no React here
    ├── workers/      # exportWorker.ts (CMYK JPEG encoding)
    ├── hooks/        # useCanvas (Fabric bridge), useHistory (50-step undo),
    │                 # useTheme
    ├── constants/    # canvas.ts, units.ts, app.ts
    ├── types/        # template.ts, psd.ts, data.ts (all data models)
    ├── utils/        # units.ts (mm↔px), id.ts
    └── test/         # Vitest setup + shims
```

`components/data/index.ts` and friends are barrel exports; import via `@/components/data`.

---

## 4. Application architecture

### Routing (`src/App.tsx`)

```
/         PsdStudioPage     ← production workflow (home)
/editor   EditorPage        ← legacy Fabric template editor
/library  LibraryPage       ← template library (placeholder)
/settings SettingsPage
/about    AboutPage
*         → Navigate to /
```

The shell is `Header` (logo + theme toggle + global loading spinner) +
collapsible `Sidebar` + routed `<main>` (wrapped in one top-level
`ErrorBoundary`) + `Footer` (version chip from `services/version.ts`,
client-side badge, credit).

### Bootstrap sequence (`src/main.tsx`)

1. Register the PWA service worker (production builds only,
   `registerSW({ immediate: true })`).
2. `await bootstrapFonts()` — restore IndexedDB fonts + register bundled
   Arimo/Arial faces **before** React mounts, so the first canvas measurement
   and paint already have the right families.
3. Render `<ThemeProvider → ErrorBoundary → App>` inside
   `ReactDOM.createRoot` (StrictMode).

### Two parallel pipelines

ID Stack carries **two** design pipelines on purpose:

1. **PSD-first pipeline (production, the home page).** Photoshop files are
   the source of truth; layers are parsed, the user marks placeholders, and
   generation re-composites the design with row data. Rendering is plain
   Canvas 2D (`psdCompositeService`), faithful to the PSD.
2. **Legacy editor pipeline (`/editor`).** Templates built in the Fabric
   editor (elements in mm), persisted via `templateService`, previewed with
   `previewService`. Kept for from-scratch design; the editor's
   `{{Placeholder}}` tokens flow through the same `dataStore` mapping/
   validation machinery.

`dataStore` resolves placeholder keys from the PSD project first and falls
back to editor-template tokens (`collectTemplatePlaceholders`).

---

## 5. State management (Zustand stores)

| Store | Owns | Notable behaviour |
|---|---|---|
| `usePsdStore` | `project {front, back, placeholders}`, parse state, batch state/control, imposition settings | `loadPsd(file, side)` parses and drops that side's old placeholders; imposition settings persist to IndexedDB (`psd-imposition-settings` key) with a raw-pixel sanity guard (>500 discarded); `saveProject` intentionally stores placeholders only — **PSD bytes are not persisted** |
| `useDataStore` | Excel data, photos, `mappings: Record<key, column>`, `photoMatchConfig/Result`, `validation` | `loadExcel` → parse → auto-map → validate; single `revalidate()` pipeline recomputes photo matching + validation; `autoMapColumns` matches keys to columns case-insensitively; photos are session-only (blob URLs) |
| `useTemplateStore` | current editor template, current side, dirty flag | CRUD actions delegate to `templateService` |
| `useCanvasStore` | zoom, pan, selection ids, current tool | Zoom clamped 0.1–4.0 |
| `useSettingsStore` | unit (`mm`/`inch`), autoSave | localStorage `id-stack-settings` (zustand persist) |
| `useUIStore` | theme, sidebarCollapsed, loading overlay | localStorage `id-stack-ui-preferences`; theme mirrored to IndexedDB by `ThemeProvider` |

Stores are plain `create()` (except the two persisted ones) and never import
each other except `dataStore → templateStore/psdStore` for placeholder
resolution.

---

## 6. Services (the core logic)

All business logic lives in `src/services/` — framework-free, unit-testable
modules.

| Service | Responsibility |
|---|---|
| `psdService.ts` | ag-psd parsing: layer tree flattening, text extraction (engine data → design px), effects extraction, mask extraction, composite + per-layer raster blob URLs. Exports `parsePsdFile(file, side)` |
| `psdColorModePatch.ts` | Enables CMYK PSDs (ag-psd gates colour modes behind a whitelist); routes through `readPsdPatched` so exactly one reader instance exists |
| `psdCompositeService.ts` | `compositeDesign()` — the pixel-faithful renderer: draws layer rasters in z-order, substitutes text/photos on placeholder layers with full styling + effects + masks |
| `textStyleOracle.ts` + `inkScan.ts` | Parse-time calibration: measure the PSD's own raster of each text layer (size/weight/slant/colour/ink box/baseline) so substituted text lands exactly where the sample was |
| `excelService.ts` | `parseExcelFile` (SheetJS, header detection, column dedupe, blank-row skip), `getPreview`, `collectTemplatePlaceholders`, `validateData` (duplicate IDs, missing required, missing photos, unmapped placeholders) |
| `photoService.ts` | Photo records with blob URLs, lenient matching (exact base name → fuzzy: spaces/underscores/case-insensitive), `processPhoto` centre-crop |
| `batchService.ts` | `runBatch()` orchestrator: per-row render → CMYK encode → ZIP; pause/resume/cancel via control ref; per-row error isolation; ETA; sheet-mode accumulation |
| `batchNaming.ts` | `buildName(template, row)` — `{Row}` (3-digit padded), `{Column}`, `{{Column}}`, filename sanitisation |
| `cmykExportService.ts` | LittleCMS WASM init, sRGB→CMYK transform, 4-component JPEG encode (APP14 transform=0), direct CMYK PDF (ICCBased colour space + GTS_PDFX OutputIntent), double-sided PDF |
| `impositionService.ts` | `buildSheetsPdf()` — draws arranged card canvases, bleed, crop marks, sheet/slot numbering onto pdf-lib pages |
| `impositionTypes.ts` | Pure geometry: `computeSheetLayout`, `arrangeSheets` (interleaved vs separate + duplex mirroring via `pairBacksForDuplex`), `deriveCardSizeFromDesign` (px ÷ DPI × 72 → unit), paper presets, `DEFAULT_IMPOSITION_SETTINGS` |
| `workerPool.ts` + `workers/exportWorker.ts` | JPEG compression off the main thread (main-thread fallback when workers unavailable) |
| `fontService.ts` | FontFace registry, IndexedDB persistence, bundled Arimo aliases (Arial/ArialMT/…), PostScript name matching (`matchPsdFont`, `resolveFontFamily`, `exactFontCss`), `preloadFontsForText` (awaited `document.fonts.load` before any measurement), name-table PostScript aliasing |
| `templateService.ts` | Editor-template CRUD on Dexie; element upsert/remove helpers |
| `previewService.ts` | Legacy editor live-preview renderer with `{{Token}}` substitution |
| `storageService.ts` | Dexie schema + typed table access (see §8) |
| `version.ts` | `__APP_VERSION__` passthrough |

---

## 7. Data flow

### Production (PSD Studio)

```
PSD file ──parsePsdFile──▶ PsdDesign {layers, compositeUrl, layerRasters}
                                │
                    LayerPicker ─┴─▶ placeholders [{layerId, role, key}]
                                                │
Excel file ──parseExcelFile──▶ ExcelData        │      photos ──▶ PhotoRecord[]
 (SheetJS)                    {columns, rows}   │          (matchPhotos per mode)
                                │                │                │
                                └──▶ mappings {placeholder.key → column}
                                                │
                              validateData → ValidationResult (UI + gates)
                                                │
      selected row ──▶ compositeDesign(design, {placeholders, mappings, row,
                                                getPhoto}) ──▶ canvas
                                                │
              runBatch (all rows) ──▶ encodeCmykJpeg / encodeCmykPdf
                                    / encodeCmykPdfDoubleSided
                                    / buildSheetsPdf (imposed)
                                                │
                                        JSZip ──▶ id-cards.zip
```

- **Live preview** and **batch** use the *same* `compositeDesign`, so what you
  preview is what ships.
- `dataStore.revalidate()` is the single source for photo assignments +
  validation; the preview, DataPreview panel and BatchRunner all read it.
- Generation yields to the browser between rows (`requestAnimationFrame`) and
  honours `paused`/`cancelled` control refs polled from the store.

### Legacy editor

`ToolsPanel → canvasApi.addElementFromData → Fabric objects ⇄ serializeObject
⇄ CanvasElement (mm) → templateStore → templateService → IndexedDB`;
`useHistory` wraps every commit in a 50-step snapshot stack.

---

## 8. Storage: IndexedDB schema

Database **`id-stack`** (Dexie, `src/services/storageService.ts`):

| Table (version) | Key | Contents |
|---|---|---|
| `keyValue` (v1) | `key` | Theme mirror, imposition settings (`psd-imposition-settings`), misc |
| `templates` (v1) | `id`, indexed `name`, `modifiedDate` | Editor templates (serialised `CardTemplate`) |
| `fonts` (v1) | `name`, indexed `fileName` | Uploaded font bytes (`ArrayBuffer`) for offline re-registration |
| `psdProjects` (v2) | `id` | Project record: placeholders + metadata. `frontPsd/backPsd` columns exist but are stored **null** by design (browser storage limits) |

localStorage keys: `id-stack-ui-preferences` (theme), `id-stack-settings`
(units, auto-save).

**Deliberate session-only state:** parsed PSDs (kept as blob URLs), Excel
rows, photos, mappings, batch results. Reloading the page means re-uploading
designs and data.

---

## 9. PSD pipeline internals

The hard-won details live in code comments; this section is the map.

### Parsing (`psdService.parsePsdFile`)

- `readPsdPatched` (CMYK-enabled reader). Layer rasters are kept
  (`skipThumbnail`, `skipLinkedFilesData`).
- **DPI** comes from `imageResources.resolutionInfo` (PPCM→PPI normalised,
  clamped to 36–2400, fallback 72). Every physical value (font points,
  effect distances, card size) converts through `px ÷ DPI × 72`.
- Layer tree is flattened **top-most first** with stable ids
  `"<side>/<group/…/name>"`.

### Text extraction — the unit contract

- Engine plain-number `fontSize` is **design pixels × the text transform's
  scale** — *not* points, *not* raw (multiplying by DPI/72 is the historical
  4.17× size bug). Unit-tagged `{units, value}` sizes convert through DPI.
- **Auto-leading** = 1.2 × size (the engine's leading sentinel is ignored).
- **ag-psd dedupe:** shared engine properties are hoisted out of
  `styleRuns` into `text.style`. Every property is coalesced
  run-first→layer-fallback (`coalesce()`); reading `styleRuns[0].style` alone
  loses data (the "Charmaine Patel" bug).
- Extracted per layer: PostScript font name, derived numeric weight
  (`deriveFontWeight`: Black/Heavy→900 … Light→300), colour (incl. CMYK fill
  conversion), bold/italic (faux flags + name lexemes), tracking
  (thousandths-of-em → px), leading, justification (per-paragraph runs
  honoured), horizontal/vertical scale (engine **fractions**, 1 = 100 %),
  baseline shift, caps (0/1/2), strikethrough, kerning, shapeType
  (`box` wraps at `boxWidth`; `point` never width-wraps), box bounds, text
  origin (transform tx/ty), engine stroke (only when `strokeFlag`), and
  resolved per-run segments (`PsdTextRun[]`).

### The style oracle (`textStyleOracle` + `inkScan`)

At parse time, each single-line text layer's **original raster** is measured:
ink box, mean colour, size calibration (sanity band 0.5×–1.6× the engine size,
else engine wins), weight/slant matching (with an italic *veto* when the
engine says upright), plus sample anchor offsets (ink-top→baseline,
origin→ink-left). `compositeDesign` applies the oracle **verbatim** so
substituted text sits exactly where Photoshop drew the sample. Wrapped
samples (single-line strings Photoshop visually wrapped) refuse calibration
(`rasterSpansMultipleLines` guard).

### Compositing (`psdCompositeService.compositeDesign`)

- Layer canvases drawn in z-order with original opacity + blend mode
  (Photoshop → `GlobalCompositeOperation` map).
- **Placeholders**: text re-drawn with row value in the layer's/oracle's
  style; photos centre-cropped into layer bounds. Both keep the layer's
  effects (drop/inner shadow, glows, stroke, colour/gradient overlay) and
  masks.
- **Mask semantics**: reveal-all (fully white) masks are no-ops; real masks
  threshold luminance ≥128 inside the mask rect, honouring
  `defaultColor` outside it.
- **Text fitting (hybrid, v0.6.12):** box text wraps at the authored width
  with the authored box height as the line budget; overflow is solved with
  **x-only compression** (Horizontal Scale) that never drops below **0.65**
  on multi-line fields (0.05 single-line), re-wrapping at the compressed
  effective width so lines converge. Offscreen layer canvases grow to fit
  (never clip at the sample's bounds).
- **Substitution semantics:** engine style runs are positional over the
  *sample* string; substituted values take the layer/oracle style wholesale.

### CMYK PSD support

ag-psd only whitelists certain colour modes; `psdColorModePatch.ts` extends
the gate and must share **one** reader instance with `psdService` — hence the
Vite alias of `ag-psd` to `dist/psdReader.js`. `isCmykPatched()` is asserted
on every parse.

---

## 10. CMYK export engine

`cmykExportService.ts` — "print shop ready, no Photoshop step":

1. **ICC transform** — LittleCMS (WASM, `assets/profiles/lcms.wasm`) builds
   one sRGB→CMYK transform against the bundled Ghostscript
   `default_cmyk.icc` (perceptual intent). Canvas pixels are repacked to a
   tight RGB buffer, transformed to interleaved CMYK bytes.
2. **CMYK JPEG** — a custom 4-component encoder (jpeg-js only writes YCbCr)
   wraps the stream with an **Adobe APP14 marker, transform=0**, telling
   decoders the components are C,M,Y,K. Compression runs in the export
   worker (`encodeJpegInWorker`).
3. **CMYK PDF** — pdf-lib pages exactly canvas-sized (points); each image is
   a DeviceCMYK/ICCBased (N=4) FlateDecode XObject; the document carries a
   **GTS_PDFX OutputIntent** referencing the embedded profile. Producer
   string identifies ID Stack.
4. **Double-sided PDF** — front page 1, back page 2, one file per person.

Quality: JPG quality option (clamped 10–100) is batch-level; PDF is lossless
Flate.

---

## 11. Imposition engine

All geometry is in **PDF points** (`toPoints` per unit: mm/cm/in/pt).

- `computeSheetLayout(settings)`: cell = card + 2×bleed; grid = margin +
  gaps; centred on the page; returns columns/rows/perSheet + every slot's
  trim box. `null` when cards don't fit (UI shows ⚠).
- **Card size is PSD-locked**: `deriveCardSizeFromDesign` computes the true
  trim size from pixel dimensions ÷ declared DPI (a 300-DPI 1056×663 px PSD
  → 86×54 mm). The panel fields are disabled; only **direction**
  (portrait/landscape) swaps width/height.
- `arrangeSheets(fronts, backs, layout, arrangement, duplex)`:
  - `interleaved` — front row r, backs row r+1, whole job one PDF
    (`sheet_Print.pdf`); only whole front rows are placed.
  - `separate` — fronts on front sheets, backs on back sheets; with
    `duplex`, `pairBacksForDuplex` mirrors each back's column so long-edge
    duplex pairs correctly (`sheet_Front_Back.pdf` / `sheet_Front.pdf` /
    `sheet_Back.pdf`).
  - **Never compact/filter the returned lists** — `null` entries keep true
    grid positions.
- `buildSheetsPdf` paints canvases (bleed extends under trim), crop marks at
  corners, sheet numbering and optional per-slot card numbers (prefix, start
  value, position, colour, size).
- Settings persist per project in IndexedDB and are restored/merged over
  defaults on startup (`restoreImpositionSettings`), discarding the
  pre-v0.6.1 raw-pixel sizes via a >500 sanity limit.

---

## 12. Font system

- **Registry**: `fontService` keeps `family → FontFace`; families are listed
  in the FontManager panel (with live sample text) and removable.
- **Persistence**: every upload is stored in IndexedDB and re-registered at
  bootstrap (`bootstrapFonts` in `main.tsx` — *before* first render so canvas
  measurement is correct on the first pass).
- **Bundled faces**: Arimo (SIL OFL, Arial-metric) registered also under
  `Arial`, `ArialMT`, `Arial-BoldMT`, … so un-fonted setups still render
  Arial designs correctly.
- **PSD matching**: `matchPsdFont` (exact normalised → base-family →
  name-table PostScript alias) resolves embedded names like
  `MyriadPro-Bold` to the user's uploaded family even when file/registration
  names differ. Unmatched names fall back through a humanised candidate list
  (`ArialNarrow` → "Arial Narrow" → "Arial") before generic sans-serif.
- **Preload**: `preloadFontsForText` awaits `document.fonts.load` for every
  referenced family/size before measuring/painting — canvas uses the *last*
  font string, so skipping this mis-wraps the first layout.
- **Exact font shorthand**: `exactFontCss(bold, italic, sizePx, family,
  weight)` is the single source shared by measurement and painting.

---

## 13. Testing

```bash
npm test              # all suites
npm run test:coverage # v8 coverage report
```

- **Location**: `tests/`, mirrored to `src/` structure; `*.test.ts(x)`.
- **Environment**: jsdom + `src/test/setup.ts` (Blob.arrayBuffer, object-URL
  shims, 2D-context mock, Image load simulation, fake-indexeddb).
- **Suites worth studying**:
  - `tests/data-flow.test.ts` — Excel → mapping → photos → validation →
    preview integration.
  - `tests/services/imposition*.test.ts`, `dpiCardSize.test.ts` — sheet
    geometry, duplex pairing, PSD-derived card sizes.
  - `tests/services/textMirror.test.ts`, `textCalibration.test.ts`,
    `textClipping.test.ts` — the PSD text contract regressions.
  - `tests/services/cmyk*.test.ts` — APP14 patching, PDF orientation.
  - `tests/hooks/useHistory.test.tsx`, stores, `units`.
- **Conventions**: pure services are tested without React; component tests
  use Testing Library; regression tests are added alongside every fixed bug
  (see CHANGELOG "Tests" sections) — keep that pattern.
- Coverage config lives in `vite.config.ts` (`include: src/**`, excludes
  `main.tsx`, `src/test/**`, `components/ui/**`, `*.d.ts`).

---

## 14. Performance & memory rules

- **Batch loop** yields with `requestAnimationFrame` between cards; pause
  polls every 150 ms. JPEG encode runs in the worker pool.
- **Blob URLs are leased memory**: photo blob URLs are revoked on
  remove/clear (`disposePhotos`); PSD layer rasters are per-session blob
  URLs; the preview image cache is bounded (`clearPreviewImageCache` on photo
  change).
- **Imposition previews** render at reduced scale (0.35) and cap sample rows
  (first 8) before painting the sheet preview.
- **History** is a structuredClone-based snapshot stack capped at 50 —
  templates are small; PSD data never enters history.
- Targets (AGENTS.md): startup < 2 s, Excel import 1000 rows < 3 s, 100 cards
  < 30 s, no UI freezing, memory < 150 MB idle / < 800 MB batch.
- When adding features: no `setTimeout`-free busy loops, dispose Fabric
  canvases on unmount, never keep `File` references longer than needed.

---

## 15. Code conventions

- **TypeScript strict**, `noUncheckedIndexedAccess`, no `any` (ESLint error).
- Functional components + hooks; **components < 200 lines**, **hooks < 100**
  (split when larger). One component per file, PascalCase file = component.
- Barrel exports (`index.ts`) per component folder; `@/` alias imports.
- JSDoc on every exported function (services follow this throughout).
- async/await everywhere; no floating promises (`void` prefix when
  intentionally discarding).
- Tailwind utility classes only; theme colours come from CSS variables
  (`bg-surface-panel`, `text-muted-foreground`, `text-destructive`, …).
- Errors: every user-facing failure is caught and shown in the UI (parse
  errors, batch errors per row, preview errors). One global `ErrorBoundary`
  wraps the router.
- All strings are English literals today (i18n was removed in v0.3.1; the
  11-language goal from AGENTS.md is *not yet met* — re-introducing i18next
  would be a significant contribution).
- Prettier + ESLint must pass: `npm run lint:fix && npm run format`.

---

## 16. Releases & deployment

- **Version**: bump `package.json` `version` (or `npm version …`) — the
  footer chip and About page read `__APP_VERSION__` automatically.
- **CHANGELOG.md**: every release gets a Keep-a-Changelog entry including a
  "Tests" subsection.
- **Build & verify**:

  ```bash
  npm run lint && npm run typecheck && npm test && npm run build
  ```

  (The build itself runs the typecheck first — a type error blocks deploy,
  see the v0.6.12 note about the stray probe test breaking Vercel.)
- **Deploy**: push to `main` → Vercel auto-deploys
  https://id-stack.vercel.app. Service worker is auto-update
  (`registerType: 'autoUpdate'`), so clients pick up new builds on their
  next visit.
- **PWA assets**: icons come from `scripts/generate-icons.mjs` (run when the
  logo changes); `includeAssets` covers favicon/robots/apple-touch-icon.
- When adding dependencies: pure JS/TS/WASM only (no native builds), verify
  bundle impact and that the SW precache glob (`**/*.{js,css,html,ico,png,
  svg,woff2}`) still covers what's needed (the .icc/.wasm assets are
  imported as URLs and therefore bundled as assets).

---

*Maintained by Prabir kumar Das ([@theprabir](https://github.com/theprabir)).
PRs welcome — please include tests for behavioural changes.*
