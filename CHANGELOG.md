# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.2] - 2026-09-26

### Fixed

- **"Maximum update depth exceeded" crash when selecting the first
  placeholder (Step 2).** Root cause: `BatchRunner` mirrored the persisted
  imposition settings into local component state with two sync effects
  (store→options and card-size auto-derivation→store, guarded by an echo
  ref). When the component mounted (which happens exactly when the first
  placeholder is chosen, because `readyToGenerate` becomes true), the
  derivation effect fired with the design's true size; the store update
  succeeded but the mirrored local state never committed, so the effect
  re-fired every render with stale values — an infinite setState loop that
  crashed the wizard. Fix: **the persisted store is now the single source of
  truth** for imposition settings. The local mirror, both sync effects and
  the echo guard were removed; the derivation effect writes the derived
  card size straight to the store (one idempotent write, after which the
  sync check passes and the effect bails). Also guards against non-finite
  design dimensions/derived sizes.
- Tests: full-wizard regression test that mounts `PsdStudioPage`, navigates
  to Step 2, selects a placeholder and asserts no crash plus a correct
  DPI-derived card size persisted to the store (154 total).

## [0.6.1] - 2026-09-26

### Fixed

- **THE DPI fix — placeholder styling AND card size together.** Both
  long-standing issues shared one root cause: the app treated PSD pixels as
  72-dpi points regardless of the document's real resolution.
  - **Placeholder text too small:** the Photoshop text engine stores font
    size and leading in POINTS while layer bounds are design pixels; at 72
    dpi they coincide, but on a 300-dpi card the substituted text rendered
    ~4× too small (tiny "Sue Smith" next to a huge raster "Name:"). Font
    sizes and leading are now converted points→design pixels through the
    document's declared resolution, so placeholder text matches the PSD
    raster exactly at any DPI. Effect distances/sizes in points/mm convert
    the same way; pixel-unit values are untouched.
  - **"The cards do not fit" error:** a 300-dpi 1056×663 px card derived to
    a raw "622.51 × 1011.35 cm" — obviously unfittable. Card size now
    derives as px ÷ DPI × 72 (= true physical size: 89.4 × 56.1 mm for that
    card), so imposition fit works at every DPI. PPCM resolutions convert
    to PPI; missing/absurd resolution values fall back to 72.
  - **State clobber:** the derived card size was written to local state only
    and the persisted-store sync effect immediately overwrote it with stale
    values — the error persisted even after the fix shipped. Derivation now
    writes through to the persisted store (with an echo guard), and restore
    discards pre-fix sizes above a sanity limit so old sessions heal on
    next load.

### Added

- `PsdDesign.horizontalResolution` parsed from the PSD's ResolutionInfo
  image resource (PPI and PPCM, sane-guarded).
- Tests: DPI card-size derivation (pt/mm/cm at 300 dpi, portrait/landscape
  swaps, 72-dpi identity, raw-pixel rejection) and DPI-aware effect
  extraction — 9 new (153 total).

## [0.6.0] - 2026-09-26

### Phase 7 — Web Worker batch rendering, fidelity fixes, final testing pass

### Fixed

- **Placeholder TEXT styling now renders correctly (photo styling already
  worked).** Root cause: the v0.5.4 refactor measured text layout on a fresh
  1×1 probe canvas, so the measurement context did not reliably carry the
  resolved font. All placeholder text now measures on a shared dedicated
  measurement canvas set to the EXACT font string used for drawing (style,
  weight, size, resolved family) — wrap, centring, leading and tracking are
  computed from the same metrics the glyphs are painted with, so drop
  shadows, strokes, glows and colour overlays land exactly on the shaped
  text.
- **Card size no longer explodes after switching card direction.** Root
  cause: an earlier build seeded card width/height in millimetres; the
  unit-aware re-derivation then wrote point-magnitude numbers into fields
  still labelled mm (e.g. a 638×1011 px PSD became a "638 × 1011 mm" card),
  which could never fit the paper ("The cards do not fit…"). The card size
  is now LOCKED to the uploaded front PSD: pixels convert to the active unit
  at 72 dpi, stale persisted sizes (different unit, app default, pre-switch
  orientation) are detected via `isCardSizeSyncedWithDesign` and re-derived
  automatically, and the width/height fields are read-only in the imposition
  panel. Switching direction swaps width/height at true PSD scale — values
  stay physically correct and always fit-testable.

### Added

- **Web Worker batch rendering (Phase 7 core).** New dedicated export worker
  (`src/workers/exportWorker.ts`) handles the CPU-heavy parts of batch
  export off the main thread:
  - CMYK JPEG compression (the 4-component encoder is pure CPU)
  - DEFLATE of raw CMYK samples for PDF image XObjects
  (`workerPool.ts`): promise-based RPC with id matching, transferables
  (ArrayBuffers are moved, never copied), a 60 s per-request timeout,
  crash recycling, and **transparent main-thread fallback** — if workers
  are unavailable (old browser, restrictive CSP) or a request fails, the
  batch continues on the main thread and never errors out because of the
  pool itself. ICC conversion stays main-thread (shared transform cache).
- **Exception-handling hardening.** ZIP packaging failures are now caught
  and surfaced as job-level batch errors instead of unhandled rejections;
  per-row error capture describes string/object throws (`describeUnknownError`)
  so no failure mode can freeze the UI or silently drop diagnostics.
- Tests: PSD-locked card sizing (identity at 72 dpi, mm conversion, sync /
  stale / orientation-switch detection, app-default rejection) and worker
  pool fallback (main-thread output equals worker contract, degraded flag)
  — 8 new (144 total).

### Performance

- Batch card export keeps the UI responsive during long jobs: JPEG
  compression runs in the worker while compositing yields per row as before.
- Transferable buffers keep peak memory at roughly one card, not two.

### Technical notes

- The worker imports the JPEG encoder through a top-level `await import`,
  bundled by Vite as a module worker; the pool degrades to the same encoder
  on the main thread (bit-identical output, verified by test).
- `disposeWorkerPool()` is exported for app teardown; the pool is lazily
  created on first export and recreated after a crash.

## [0.5.4] - 2026-09-26

### Fixed

- **Placeholder text now re-renders with the exact Photoshop styling.**
  Previously substituted text kept only the base text style (font, size,
  colour, tracking, leading, justification). All Photoshop **layer effects**
  on the placeholder text layer are now extracted at parse time and applied
  during re-rendering: drop shadow (Photoshop angle/distance semantics),
  inner shadow, outer glow, inner glow, stroke (outside/center/inside), and
  colour overlay (solidFill). Static text layers were already pixel-faithful
  (drawn from original rasters) and remain untouched.
- **Placeholder photos now render with the placeholder's styling.** A
  substituted photo now carries the photo layer's original effects — drop
  shadow, inner shadow, outer glow, stroke outline and colour overlay —
  instead of a plain centre-cropped rectangle. The photo is still
  centre-cropped to the layer aspect, never stretched.
- **Layer/vector masks clip re-rendered placeholders.** If the placeholder
  text or photo layer has a raster or vector mask in the PSD, the substituted
  content is masked by it exactly like Photoshop (white = keep, black =
  hide), including the mask's own offset when it differs from the layer
  bounds.
- **Photoshop clipping masks honoured for photo placeholders.** A photo
  placeholder that is clipped to the layer below (Photoshop clipping mask,
  e.g. a photo inside a shape) is now alpha-masked by that base layer's
  raster, so substituted photos keep their shaped silhouettes.

### Added

- `PsdLayerEffects` type + `extractLayerEffects` parser: normalises ag-psd
  effect descriptors (disabled effects dropped, UnitsValues converted to
  pixels, CMYK/RGB/float colours converted via the shared `agColorToCss`,
  Photoshop "size" halved to canvas blur radius) into a serialisable,
  renderer-agnostic form carried on every `PsdLayerInfo`.
- Mask bitmaps (`PsdLayerInfo.maskCanvas` + `maskOffset`) extracted from
  layer and real (vector) masks at parse time.
- Effects-aware rendering internals: padded offscreen layer canvases (so
  shadows/glows/strokes are never clipped at layer edges), the
  inner-shadow/inner-glow halo-intersection composite (canvas-accurate
  recipe: invert-offset shadow halo → erase shape → intersect shape), and
  glyph-shape drop shadows for text.
- Tests: effect extraction (drop shadow geometry, disabled filtering,
  stroke position, glows/overlay, CMYK colours) — 7 new (136 total).

### Technical notes

- Canvas has no native inner-shadow; the halo-intersection method reproduces
  Photoshop's inner shadow/glow to within antialiasing tolerance.
- Stroke "outside" on text is approximated by an under-stroke at double
  width (canvas cannot offset outlines); visually equivalent for the stroke
  widths used on ID card designs.
- All effect units are in layer pixels and scale with the render scale, so
  previews and full-resolution exports stay consistent.

## [0.5.3] - 2026-09-26

### Changed

- **Interleaved front/back sheets (the big fix).** Imposed sheet output no
  longer puts all fronts and all backs on separate sheets. By default each
  front is placed with its own back **directly below it** on the same sheet
  (row 1 = Front1 Front2 …, row 2 = Back1 Back2 …, row 3 = Front3 Front4 …)
  — exactly like the reference layout. Output is one combined PDF
  (`sheet_Print.pdf`), ideal for cutting stacks that keep each person's
  front and back together.
- **No more stretched/distorted cards.** Card images are now contain-fitted
  into their slot: they scale uniformly and are centred, never squashed.
  When the card box aspect differs from the design aspect the card is
  letterboxed — portrait designs stay portrait inside landscape boxes and
  vice versa.
- **Live preview shows real cards.** The imposed-sheet preview now renders
  actual sample cards (first rows with real data and photos) instead of
  empty dashed boxes, and repaints instantly on every setting change
  (paper, size, orientation, arrangement, marks, numbering). A summary line
  shows pairs/cards per sheet and how many sheets the job will produce.

### Added

- **Card direction control** in the imposition panel: portrait or landscape
  card orientation, independent of the page orientation (page landscape/
  portrait already existed). The layout grid re-computes for the chosen
  direction; images remain undistorted via contain-fit.
- **Arrangement control**: "Back below its front (one PDF)" (interleaved,
  default) or "Fronts & backs on separate sheets" (previous behaviour; with
  duplex pairing the backs are mirrored per row for long-edge duplex).
- New tests: interleaved pairing, multi-sheet pairing, separate mode,
  orientation layout maths and contain-fit geometry (8 tests).

## [0.5.2] - 2026-09-26

### Changed

- **PSD Studio is now a 3-step wizard.** The old single-page layout (and the
  separate Data page) are consolidated into one guided flow, all inside the
  PSD Studio tab:
  1. **Upload Designs & Data** — PSD front/back upload, Excel import,
     photo import and font management
  2. **Choose Placeholders** — layer pickers for both sides
  3. **Generate** — column mapping, data validation table, live front/back
     preview and the full batch output (cards ZIP or imposed printable
     sheets) — the whole generation workflow
- **Back / Next navigation** between steps with a clickable step indicator:
  completed steps show a green check, future steps stay locked until their
  requirements are met, and blocked Next buttons explain what is missing.
- **Nothing is lost while navigating** — all three step panels stay mounted
  (hidden when inactive) and all state lives in the shared stores, so users
  can freely go back to change/add/remove uploads or placeholders and
  return without any data loss.

### Removed

- The **Data** sidebar tab and `/data` route — data upload now lives in
  step 1 of PSD Studio (`DataImportPage.tsx` deleted).

## [0.5.1] - 2026-09-26

### Added

- **Duplex pairing for sheet output.** New toggle in the imposition panel:
  when enabled, back-side cards are automatically mirrored per row within
  each sheet-sized block (front slot 1 pairs with back slot N, slot 2 with
  N−1, …) so long-edge duplex printing puts each back exactly behind its
  front. Single-column layouts pass through unchanged.
- **Per-slot card numbering.** Optional sequence number printed on every
  card slot of an imposed sheet. Fully user-controlled: on/off, corner
  position (4 options), font size, colour, margin from the card edge,
  prefix (e.g. `#`) and start value — numbering runs continuously across
  sheets and every occupied slot counts. Mirrored in the live preview.
- **Card numbers UI** (`ImpositionPanel`): dedicated "Card numbers" section
  exposing every option above, plus a "Duplex pairing" checkbox.

### Changed

- Card numbers on imposed sheets now use their own colour setting instead
  of inheriting the sheet-numbering colour.
- Imposition settings (paper, spacing, marks, numbering, card numbers,
  duplex) persist per browser in IndexedDB and are restored on the next
  session; stored settings are merged over defaults so new options stay
  valid.

## [0.5.0] - 2026-09-26

### Phase 6 — Imposition Engine

### Added
- **Imposed sheet PDFs.** New "Sheets" output mode in the batch runner:
  rendered cards are arranged on a physical paper size (A4/A3/Letter/Legal/
  Tabloid or fully custom, portrait/landscape) as an N-per-sheet grid, with
  each side exported as its own multi-page CMYK PDF (sheet_Front.pdf /
  sheet_Back.pdf) carrying the ICCBased colour space and GTS_PDFX
  OutputIntent
- **Everything user-controlled** (`ImpositionPanel`):
  - Paper preset or custom width/height, with mm / cm / inch / pt units
  - Card trim size, bleed (all sides), gap between cards, sheet margin
  - Crop marks on/off, mark length, mark offset from trim, mark colour
  - Numbering: per-sheet / continuous / none, six positions (corners/centres
    top & bottom), font size, colour, and optional prefix ("Sheet 1")
  - Live cards-per-sheet readout with fit warnings, and a scale preview that
    mirrors the PDF exactly (dashed empty slots, blue trim lines, crop marks,
    number position)
- **One PDF per person.** Double-sided PDF export now produces a single
  two-page file per data row (page 1 = front, page 2 = back) instead of two
  separate files — 3 persons → 3 two-page PDFs
- **Imposition services**: `impositionTypes` (units, presets, layout math —
  centred grid, uniform pitches, slot list) and `impositionService`
  (`buildSheetsPdf` with one content stream + shared Resources per page,
  crop-mark path operators, Helvetica sheet numbers; `renderSheetPreview`)
- **Bundled Arial-compatible font** (Arimo, SIL OFL 1.1, ~500 KB per face):
  registered at startup under `Arimo`, `Arial`, `ArialMT`, `Arial-BoldMT` etc.
  so PSD text renders with correct metrics without any user upload; user
  fonts still take precedence when uploaded
- **Footer rework**: compact "ID Card Designer" tagline (hidden on mobile),
  "100% client-side" badge (hidden below desktop width), "Created by Prabir
  kumar Das" credit with a GitHub profile link — always visible
- Tests: unit conversion, paper resolution, grid fitting/centring/row-major
  order, fit failure, sheet PDF structure (page count, MediaBox, image count,
  numbering text, crop-mark operators) (11 new; 111 total)

### Fixed
- **Placeholder text styling now matches the PSD preview**: alphabetic
  baseline with real font ascent/descent metrics, Photoshop leading
  (baseline-to-baseline) semantics, vertical centring from true metrics,
  justification width includes tracking, and underlines are drawn as bars
  under the baseline
- pdf-lib content-stream encoding hardened against cross-realm typed arrays
  (jsdom `TextEncoder`)

## [0.4.2] - 2026-09-26

### Fixed
- **Blank output root cause (layer paint order).** `compositeDesign` iterated
  ag-psd layers reversed, but ag-psd returns layers **bottom-most first** —
  so the opaque Background raster painted LAST, covering all content. Now
  iterates forward (bottom → top), matching Photoshop semantics
  (`psdCompositeService.ts`)
- **CMYK text colours.** PSD text fills arrive as CMYK `{c,m,y,k}` on a 0–255
  scale; `agColorToCss` (`psdService.ts`) now converts them with the standard
  ink formula — verified pixel-exact against the rasterised text

### Added
- **True CMYK JPEG export.** jpeg-js only writes 3-component YCbCr, so a local
  4-component Adobe CMYK encoder was written (`cmykJpegEncoder.ts`): baseline
  SOF0 with 4 components (C/M/Y/K ids 1–4, 1×1 sampling), two quantisation
  tables, the four standard Huffman tables, no colour transform, and an Adobe
  APP14 marker (transform=0) written directly into the header. Per the Adobe
  convention the CMYK ink values are stored **inverted** (255 − ink) so every
  conforming decoder (Photoshop, Acrobat, Ghostscript, jpeg-js) reads them
  correctly. Verified in-browser: 4-component SOF, transform=0, decodes to a
  bitmap in Chrome, ~590 ms for 638×1011 at q92 (190 KB)
- **Direct CMYK PDF export** (`encodeCmykPdf` in `cmykExportService.ts`):
  pdf-lib document with a DeviceCMYK image XObject (FlateDecode), an ICCBased
  colour space embedding the bundled CMYK profile (N=4), and a GTS_PDFX
  OutputIntent — genuine print-shop CMYK with no Photoshop round-trip.
  Verified in-browser: ICCBased + OutputIntent + GTS_PDFX present, ~710 ms,
  724 KB for 638×1011
- **ICC colour engine** (`@kittl/little-cms` WASM): true sRGB→CMYK transform
  using Ghostscript's `default_cmyk.icc` (bundled at
  `src/assets/profiles/`; the Compact-ICC-Profiles micro profile lacks the B2A
  tag needed for the forward direction)
- **In-browser font loading** (`fontService.ts` + `FontManager.tsx`):
  drag-drop/pick .ttf/.otf/.woff/.woff2, registered via the FontFace API,
  persisted in IndexedDB and restored on startup. PSD font names
  (PostScript style, e.g. `ArialMT`) match loaded families by exact normalised
  name or base family (so `Arial` covers `Arial-BoldMT`); composite text
  rendering uses the resolved family. Verified in-browser end-to-end
- PNG export removed from the batch pipeline — JPG (CMYK) and PDF (CMYK) are
  the print-ready outputs
- Tests: 4-component JPEG structure + decode round-trips (white/black/K-only,
  edge-clamped non-multiple-of-8 sizes), APP14 patcher, font name matching
  (13 new; 100 total)

### Fixed
- **Vertical flip in PDF export.** The PDF writer mirrored rows bottom-to-top
  on the wrong assumption — PDF image data (like canvas ImageData) is stored
  top-row-first, so the exported card appeared upside-down in Acrobat while
  the JPEG was correct. Row reordering removed; a regression test with an
  asymmetric red/blue mock canvas asserts the first stored row is the canvas
  top (test count: 101)

### Changed
- `BatchOptions.format` is now `'jpg' | 'pdf'`; BatchRunner shows
  "JPG (CMYK)" / "PDF (CMYK)" with JPG as default
- Bundled ICC profile is Ghostscript's generic CMYK (not FOGRA/SWOP
  certified); PDF OutputConditionIdentifier is `CUSTOM_CMYK`

## [0.4.1] - 2026-09-25

### Fixed
- **Blank card output (critical).** Generated/preview images showed only the
  background — all other layers were missing:
  - Root cause: the CMYK patch imported ag-psd's deep reader module while the
    app parsed via the public entry — Vite's dep-optimizer bundled them as two
    separate module copies, so the patch never reached the parser (and broke
    in-browser loading outright with "exports is not defined")
  - Fix: `vite.config.ts` aliases the public `ag-psd` entry to the single deep
    reader module instance and pre-bundles that path; parsing now goes through
    `readPsdPatched` in `psdColorModePatch.ts` — one module, patch guaranteed
  - Verified in-browser with a 3-layer forged PSD: composite reproduces all
    layers in correct z-order (title/photo/background pixel-sampled), text
    substitution renders in the extracted style, photo substitution
    centre-crops into the placeholder bounds, and untouched layers keep their
    original rasters

### Changed
- **Photo mapping modes clarified** (user chooses one):
  1. **By Excel column** — a column holds the photo file name (extension
     optional). New lenient matching: exact base name first, then fuzzy match
     ignoring spaces/underscores/hyphens/dots/case ("Ravi Verma" in Excel
     matches `ravi_verma.jpg` on disk)
  2. **By card-holder name** — same lenient matching against any row value
     (typically the Name column) for photos named after the person
  3. **Manual** — new assignment panel in Data & Validation: per-row photo
     picker with clearly visible thumbnails (current assignment + strip of all
     uploaded photos), plus a "None" clear option
- `assignPhotoManually` now accepts an empty id to clear an assignment
- CMYK patch hardening: `isCmykPatched()` diagnostic and re-assertion on every
  parse

### Added
- Tests: fuzzy matching (spaces/underscores/case), empty-id clearing (4 new; 87 total)
- `tests/services/psdService.test.ts` covers RGB + CMYK parse-gate behaviour

## [0.4.0] - 2026-09-25

### Phases 4 & 5 — PSD-First Pipeline & Batch Generation

### Added
- `psdService` (ag-psd): layered .psd parsing per card face, flattened layer tree with kinds (text/image/group), bounds/opacity/blend/effect flags, full text style extraction (font, size, colour, bold/italic/underline, tracking, leading, justification, style runs), per-layer rasters + composite preview
- `psdCompositeService`: pixel-faithful card rendering — placeholder text layers re-drawn with row content in the original style; photo layers filled with the row's matched photo (centre-crop); ALL other layers drawn from original rasters untouched, in original order, opacity and blend mode
- `LayerPicker` (front/back): filterable layer list, mark any text layer as text placeholder or raster layer as photo placeholder, editable mapping keys, remove
- `PsdStudioPage` at `/`: guided workflow (upload designs → choose placeholders → import data → map columns → live preview → generate) with step indicator and front/back preview tabs
- `batchService`: chunked batch generation with `BatchState` progress (current/total/ETA/errors), pause/resume/cancel via control ref, JSZip packaging, PNG/JPG quality option, front/back/both sides
- `BatchRunner`: options (format, sides, naming template), live progress bar, pause/resume/cancel controls, error list, ZIP download
- `batchNaming`: `{Row}`, `{Column}`, `{{Column}}` templates with file-name sanitisation
- IndexedDB schema v2: `psdProjects` table for placeholders/mappings persistence
- Tests: placeholder key collection, row resolver semantics, batch naming (9 new; 80 total)

### Changed
- App home is now PSD Studio (`/`); the legacy Fabric editor moved to `/editor`
- `dataStore` placeholders source: PSD project keys take precedence over editor template tokens
- `ColumnMapping` now takes generic placeholder→column pairs (works for PSD keys and editor tokens)
- Sidebar: PSD Studio / Editor / Data / Library / Settings / About

## [0.3.1] - 2026-09-25

### Removed
- **Multi-language support.** The interface is now English-only:
  - Removed i18next / react-i18next and all `public/locales/` translation files (11 languages)
  - Removed the language switcher from the header and the language section from Settings
  - Removed `src/i18n/`, `src/constants/languages.ts` and the `language` field from settingsStore
  - All translated strings replaced with plain English literals across every component and page

### Changed
- Bundle size reduced (~285 KB → smaller; locale JSON and i18n runtime no longer shipped)

## [0.3.0] - 2026-09-25

### Phase 3 — Data Import

### Added
- `excelService`: SheetJS-based parsing of .xlsx/.xls/.csv (first sheet, header detection), duplicate-column-name dedupe, blank-row skipping, column/preview helpers, template placeholder collection (placeholder elements + `{{Token}}` text), data validation (missing required fields, duplicate IDs, missing photos, sparse rows, unmapped placeholders)
- `photoService`: multi-photo import with dimensions and blob URLs, auto-matching by filename / Excel column / manual assignment (path- and extension-tolerant), centre-crop + resize processing, blob-URL disposal
- `previewService`: 2D-canvas card renderer with `{{Placeholder}}` substitution, word-wrapped text, image centre-crop, shapes, barcodes (placeholder box), shadows and strokes; image cache with size bound
- `dataStore`: Excel data, photos, matching config/result, mappings and validation state; auto-map on import; single `revalidate()` pipeline shared by UI and preview
- Data Import page (`/data`) with sidebar navigation: ExcelImport (file picker + drag-drop), ColumnMapping (placeholder ↔ column with sample data + auto-map), DataPreview (validation report + row picker table), CardLivePreview (renders selected row onto current template), PhotoImport (thumbnails, match-mode selector, per-photo delete)
- i18n: new `data.*` and `nav.data` keys in all 11 locales (Hindi, Marathi and Spanish fully translated for the new section)
- Tests: excelService (16), photoService (10), previewService (8), Excel→mapping→photos→validation→preview integration (1)

### Changed
- Test setup extended with jsdom shims (Blob.arrayBuffer, deterministic object URLs, 2D-context mock, Image load simulation)

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
