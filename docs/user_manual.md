# ID Stack — User Manual

A complete, step-by-step guide to using **ID Stack**, the browser-based ID card
designer and batch printing studio. Everything runs on your own device — no
installation, no account, no upload of your data to any server.

> **Companion documents:** [Keyboard shortcuts](keyboard_shortcuts.md) ·
> [Troubleshooting guide](troubleshooting.md)

---

## Table of contents

1. [What is ID Stack?](#1-what-is-id-stack)
2. [Getting started](#2-getting-started)
3. [The workspace at a glance](#3-the-workspace-at-a-glance)
4. [PSD Studio — the main workflow](#4-psd-studio--the-main-workflow)
   - [Step 1 — Upload designs & data](#step-1--upload-designs--data)
   - [Step 2 — Choose placeholders](#step-2--choose-placeholders)
   - [Step 3 — Map columns & preview](#step-3--map-columns--preview)
   - [Step 4 — Generate & print](#step-4--generate--print)
   - [Working across steps](#working-across-steps)
5. [Documentation, Settings & About](#5-documentation-settings--about)
6. [Printing guide](#6-printing-guide)
7. [Privacy & offline use](#7-privacy--offline-use)
8. [Reference: supported files & limits](#8-reference-supported-files--limits)

---

## 1. What is ID Stack?

ID Stack produces **personalised ID cards in batches** from two ingredients:

| Ingredient | Example | Where it comes from |
|---|---|---|
| A layered **Photoshop design** (.psd) for the card's front and/or back | `ID Sample Front.psd` | Your designer (a sample is bundled in the repo's `sample-data/` folder) |
| A **spreadsheet** with one row per person | `employees.csv` | HR records, school registers, Excel/Google Sheets exports |
| *(optional)* **Photos**, one per person | `john_smith.jpg` | Any folder of images |

ID Stack reads the PSD, you mark which layers hold **variable** information
(name, photo, ID…), map those to spreadsheet columns, and it then renders one
finished card per row — exported as CMYK print files (JPG/PDF), imposed
print-ready sheets, or per-person double-sided PDFs, packaged in a ZIP.

**What it is not:** it does not replace Photoshop (you still design there), it
has no cloud, and it never sends your files anywhere.

### Core concepts

- **Design (PSD)** — a layered Photoshop file for one card face. Flat/merged
  images cannot be used; layers are what make substitution possible.
- **Placeholder** — a PSD layer (text or image) that you designate as
  "this changes per card". Each placeholder gets a **mapping key** (its layer
  name by default).
- **Mapping** — the link between a placeholder key and an Excel column.
- **Batch** — one run of generating all cards for all rows.
- **Imposition** — arranging multiple cards on a paper sheet with bleed, gaps,
  crop marks and numbering, for printing many cards per page.

---

## 2. Getting started

### Requirements

- A modern browser: **Chrome 110+, Edge 110+, Firefox 115+ or Safari 16+**
- Nothing to install — the app runs at [id-stack.vercel.app](https://id-stack.vercel.app)

### Open the app

Go to **https://id-stack.vercel.app**. On first visit the browser caches the
app so it also works **offline** afterwards (see [Privacy & offline use](#7-privacy--offline-use)).

### Optional: install as a desktop app

In Chrome or Edge, an **install icon** appears in the address bar — click it to
install ID Stack as a standalone app with its own window and taskbar icon.

### Have your files ready

1. **Layered PSD** for the front (and optionally the back) of the card, with
   layer names that match your spreadsheet headings where possible.
2. **Excel/CSV** with a **header row** (e.g. `Name, ID, Department`) and one
   row per person. Only the **first sheet** of a workbook is read.
3. *(Optional)* **Photos** named after the people, e.g. `Priya Sharma.jpg`.

> Tip: the repository's [`sample-data/`](https://github.com/theprabir/ID-Stack-Web/tree/main/sample-data)
> folder contains a working example (two sample PSDs, `employees.csv` and a
> photos folder) you can use to try the whole flow end-to-end.

### Sample data bundled with the project

`sample-data/employees.csv` follows this shape:

| Name | ID | Department | … |
|---|---|---|---|

…with one row per employee. Design your spreadsheet similarly; column names
are free-form — you map them in Step 3.

---

## 3. The workspace at a glance

The window has three fixed areas:

```
┌──────────────────────────────────────────────────────────┐
│ Header:  ID Stack logo ………………………………… theme toggle (🌙/☀️) │
├──────────┬───────────────────────────────────────────────┤
│ Sidebar  │  Page content                                 │
│ PSD Studio│                                              │
│ Documentation │                                          │
│ Settings │                                               │
│ About    │                                               │
│ « / »    │                                               │
├──────────┴───────────────────────────────────────────────┤
│ Footer:  version · "100% client-side" · creator credit    │
└──────────────────────────────────────────────────────────┘
```

- **Header** — logo (click to go home) and the **theme toggle** (sun/moon).
  Dark is the default; the choice is remembered.
- **Sidebar** — the four pages. The bottom `«` / `»` button collapses it to
  icons only; the state is remembered.
- **Footer** — shows the running version, the "100% client-side" badge and a
  link to the creator.

### The four pages

| Page | Purpose |
|---|---|
| **PSD Studio** | The guided 4-step production line: upload → placeholders → map & preview → generate. This is where cards are made. |
| **Documentation** | Guides and references: quick start, user manual, troubleshooting, shortcuts. |
| **Settings** | Color palette, dark/light theme, privacy info. |
| **About** | Version, author, project links. |

---

## 4. PSD Studio — the main workflow

Open **PSD Studio** (the home page). Four numbered steps run across the top;
click a step chip to jump (steps unlock as prerequisites are met — see
[Working across steps](#working-across-steps)). Steps 3 and 4 fit the
viewport — their panels scroll internally instead of the page.

### Step 1 — Upload designs & data

This step holds four cards:

**Front Design / Back Design (left)**
- Click the dashed area or **drag a `.psd` file** onto it.
- Parsing takes a moment ("Parsing PSD…" appears). When ready you'll see a
  small preview, the file name, pixel dimensions and layer count.
- Upload the front and back **from two separate PSD files** (one per side).
  - Design must be **layered** — a flattened PSD is rejected with a clear
    message.
- Use the **✕** button to remove a side (its placeholders go with it).

**Excel Data (left, below)**
- Click or drop a `.xlsx`, `.xls` or `.csv` file.
- After loading you'll see the file name, **row count and column count**.
- **Replace** swaps the file; **✕** removes it (mappings are reset with it).

**Photos (right)**
- Click or drop **multiple image files** (`.jpg .jpeg .png .webp .gif .bmp`).
- Thumbnails appear in a grid; hover one and click **✕** to remove it, or
  **Remove all** to clear.
- **Photo mapping mode** — how photos are matched to rows:
  - **By card-holder name** *(default)* — each row's values are compared with
    photo file names. Lenient: spaces, underscores, hyphens, dots and letter
    case are ignored, so `John_Smith.jpg` matches "John Smith" in the sheet.
  - **By Excel column** — pick the column that holds the photo file name
    (extension optional, path tolerated: `photos/john.jpg` works).
  - **Manual** — you assign each row's photo yourself in Step 3's Data &
    Validation panel.
- A line reports **"N of M photos matched to rows"** so you can spot gaps
  before generating.

**Fonts (right, below)**
- If your design uses fonts you have as files, **upload them here**
  (`.ttf .otf .woff .woff2`). Fonts persist in your browser and reload
  automatically — you only do this once per browser.
- Uploaded fonts are matched to the fonts embedded in the PSD by name, so
  substituted text renders in the exact typeface.
- If you skip this, text still renders using the closest available system
  font (an Arial-compatible font is bundled, so Arial designs look right
  out of the box).

**Continue** to Step 2 once at least one design *or* an Excel file is loaded.

### Step 2 — Choose placeholders

One **Front Layers** and one **Back Layers** panel list every layer of that
side in Photoshop order, with a type icon (text / image / group):

- **Text layers** get a **Text** button → marks them as a *text placeholder*
  (e.g. Name, ID, Designation).
- **Image/shape layers with pixels** get a **Photo** button → marks them as a
  *photo placeholder* (the portrait window).
- Use the **Filter layers…** box to search by name or group path, and the
  **Hidden** checkbox to show layers hidden in the PSD.
- Chosen placeholders are highlighted and show an editable **mapping key**
  (a short field next to them). The key defaults to the layer name — rename it
  to match your Excel column heading if you like (e.g. `Employee Name` →
  `Name`); matching with columns is case-insensitive later.
- Click **✕** to remove a placeholder again.

> **Practical tips**
> - Name layers sensibly in Photoshop (`Name`, `Photo`, `ID`) — the default
>   keys then auto-map to matching columns with one click of **Auto-map**.
> - Only mark layers that **change per person**. Everything else stays
>   pixel-identical to your design.

**Continue** to Step 3 once at least one placeholder is chosen.

### Step 3 — Map columns & preview

The left column holds the mapping and the data table; the right column holds
the live card preview.

**Column Mapping (left)**

A table with one row per placeholder:

- **Placeholder** — shown as `{{Key}}`.
- **Excel column** — a dropdown of your sheet's columns; choose one, or leave
  "Not mapped" (the placeholder will show its original PSD content / dash).
- **Sample** — the first row's value, so you can eyeball the mapping.
- **Auto-map** — one click matches placeholder keys to columns with the same
  name (case-insensitive). Run it after import; fix the leftovers by hand.

**Data & Validation (left, below)**

- A table of the first rows of your sheet. **Click a row** to preview that
  person's card on the right.
- A **validation report** sits above the table:
  - ✅ "All N rows valid" — green light.
  - ⚠ **Warnings** — e.g. unmapped placeholder, no photo found for a row,
    a row containing only an ID. Warnings do not block generation.
  - ✖ **Errors** — e.g. duplicate IDs or required fields empty in a row.
    Errors are listed with row numbers — fix them in your spreadsheet and
    re-import, or edit in Excel and use **Replace**.
- In **Manual** photo mode this panel also shows a **Manual photo
  assignment** list: each record with its current photo and a strip of all
  uploaded thumbnails to pick from, plus a **None** option.

**Live Preview (right)**

- **Front / Back** tabs above the preview switch faces.
- The preview is a real render: placeholders filled from the selected row,
  photos placed, fonts and effects applied — exactly what will be exported.
- "Showing row N" confirms which row you're looking at.

**Continue** to Step 4 once every placeholder is mapped (unmapped ones are
flagged in the validation report).

---

### Step 4 — Generate & print

All controls sit in the left column; the live imposed-sheet preview sits in
the right column — no scrolling between settings and preview. The panel
scrolls internally if needed.

**Output options (left)**:

| Option | Choices | Meaning |
|---|---|---|
| **Format** | `JPG (CMYK)` / `PDF (CMYK)` | All output is print-ready CMYK (ICC-corrected). PDF keeps vectors/precision for print shops. |
| **Sides** | Front + Back / Front only / Back only | Which faces to render. |
| **File naming** | text pattern | Tokens: `{Row}` = padded row number (001, 002…), `{ColumnName}` and `{{ColumnName}}` = the row's value from that column, e.g. `{Name}_{Row}` → `Alice_001`. Invalid filename characters are replaced with `_`. |
| **Output layout** | Cards / Sheets | *Cards* = one file per card (PDF doubles: front page 1, back page 2 in one file per person). *Sheets* = imposed print sheets — PDF format only. |

- Press **Generate N card(s)** to start.

**During generation:**

- A **progress bar** with "current / total", and a live **ETA** ("12s left" /
  "2 min left").
- **Pause** suspends the run; it becomes **Resume**.
- The **stop button** cancels; everything rendered so far is discarded.
- **Errors** (if any) appear in a red list with the row number and reason —
  one bad row never stops the others.

**When finished:** a **Download ZIP** button appears. Inside you'll find one
file per card (or per person) named by your pattern — or, in Sheets mode, the
imposed sheet PDFs (`sheet_Print.pdf` for the combined layout, or
`sheet_Front_Back.pdf` / `sheet_Front.pdf` / `sheet_Back.pdf`).

**Sheet layout (left, Sheets mode only)**

When Output layout = Sheets, the full **Imposition panel** appears under the
output options and the **live preview** renders right beside it (right
column) with real sample cards:

- **Paper** — A4 / A3 / Letter / Legal / Tabloid (11×17) / **Custom**
  (width + height fields appear), plus a **Landscape** checkbox.
- **Unit** — mm, cm, inch or pt (applies to every dimension below).
- **Card width/height** — locked, shown "(from PSD)": the card's true physical
  size is derived from the PSD's pixel dimensions and its declared DPI.
- **Card direction** — Portrait (tall) / Landscape (wide); swaps width/height
  at the true scale.
- **Arrangement** —
  - *Back below its front (one PDF)*: each card's back sits directly under
    its front on the same sheet (row 1 = fronts, row 2 = matching backs…).
    Ideal for cutting stacks; output is a single `sheet_Print.pdf`.
  - *Fronts & backs on separate sheets*: all fronts, then all backs — for
    duplex printers.
- **Bleed / Gap / Margin** — the card's bleed extension, space between cards
  and space around the sheet.
- **Crop marks** — toggle, then **mark length** and **mark offset**; the
  blue lines in the preview are the trim lines.
- **Numbering (per sheet)** — mode (Per sheet / Continuous / None), position
  on the sheet (9 positions), font size (pt) and colour.
- **Card numbers (per slot)** — a sequence number printed on every card
  (e.g. seat numbers): enable, then position, size, colour, margin, a
  **prefix** (e.g. `#`) and the **start** value.
- **Duplex pairing** — mirrors back columns so long-edge duplex printing
  lands each back exactly behind its front (separate-sheets layout).
- A live **fit summary** reads e.g. `2 × 5 = 10 cards per sheet (page
  8.3×11.7 in)`, or warns "⚠ Cards do not fit on this paper — reduce card
  size, bleed, gap or margin."
- The **preview canvas** re-renders instantly with your real cards as any
  setting changes; empty slots are dashed.

### Working across steps

- All step panels **stay loaded** — you can move back and forth without losing
  anything; the step chips show what's reachable.
- Gates: Step 2 needs a design or data; Step 3 needs at least one placeholder;
  Step 4 needs data and placeholders.
- Changing the Excel file re-runs auto-map and validation automatically.
- Imposition settings **persist** between sessions (stored locally), so a
  re-run uses the same sheet layout.
- **Known limitation:** PSD files themselves are not persisted between
  sessions — re-upload them when you return (placeholders and settings are
  remembered).

---

## 5. Documentation, Settings & About

**Documentation** — the in-app guides hub: a quick-start summary of the PSD
Studio workflow plus the full guides rendered right inside the app — this
manual, the troubleshooting guide, the keyboard-shortcut reference, the
developer manual and the changelog. Guides open with a shareable
`?guide=` link and a back button; their markdown sources live in the
repository's `docs/` folder.

**Settings**

| Section | Setting | Notes |
|---|---|---|
| Appearance | **Color palette** | Classic / Warm Lime / Carbon Teal, each with its own dark and light mode. |
| Appearance | **Dark / Light** tiles | Same as the header toggle; applies instantly and is remembered. |
| Privacy & data | Informational | "No server / Local storage / No account" — nothing to configure. |

**About** — current version chip, "100% Client-Side" badge, the author's
profile (GitHub / Instagram / copy email), featured projects and licence info.

---

## 6. Printing guide

### Getting the best print results

1. **Prefer CMYK PDF** for print shops; JPG (CMYK) works for quick runs.
   Both embed the ICC-corrected conversion — no Photoshop round-trip needed.
2. **Design at print size.** A standard CR80 card is 85.6 × 54 mm. Design the
   PSD at that physical size (e.g. 1011 × 638 px at 300 DPI). The imposition
   panel derives the true card size from your file automatically.
3. **Add bleed in the design** if your printer requires it; set the Bleed
   value in the imposition panel to match (3 mm is typical).
4. **Imposed sheets**: choose the arrangement that matches your process:
   - Cutting by hand → *Back below its front (one PDF)*, crop marks ON.
   - Duplex printer → *Fronts & backs on separate sheets* with **Duplex
     pairing** ON, print long-edge duplex at 100% scale ("Actual size").
5. **Numbering**: use *Card numbers (per slot)* for sequential card IDs
   printed on the sheet, and *Numbering* for sheet-level numbers only.

### Printer dialog checklist

- Paper size = the sheet size you imposed for (A4 etc.).
- Scale = **100% / Actual size** (never "Fit" — it breaks crop marks).
- Duplex = long-edge binding for separate-sheets mode with pairing on.

---

## 7. Privacy & offline use

- **100% client-side** — parsing, rendering, colour conversion and ZIP
  packaging all happen in your browser. There is no server, no analytics, no
  account.
- **Where your data lives:** Excel rows, photos and rendered cards exist only
  in the browser tab's memory (and the ZIP you download). Uploaded fonts and
  imposition settings are stored in the browser's
  **IndexedDB/localStorage** so they survive reloads — clearing site data
  removes them.
- **Offline:** after the first visit, the app is served from the service
  worker cache. Note that offline use still requires re-uploading PSDs per
  session (they are intentionally not persisted).

---

## 8. Reference: supported files & limits

| Item | Supported | Notes |
|---|---|---|
| Designs | Layered `.psd` (RGB or CMYK) | Flattened files rejected; layer rasters + effects + masks are honoured |
| Spreadsheets | `.xlsx`, `.xls`, `.csv` | First sheet only; row 1 must be the header; duplicate column names are de-duplicated automatically |
| Photos | `.jpg .jpeg .png .webp .gif .bmp` | Centre-cropped to the placeholder's aspect |
| Fonts | `.ttf .otf .woff .woff2` | Persisted locally; matched to PSD font names |
| Export | CMYK JPG, CMYK PDF (per card, per person double-sided, or imposed sheets) | Packaged as `id-cards.zip` |
| Naming tokens | `{Row}`, `{Column}`, `{{Column}}` | e.g. `{Name}_{ID}` |
| Sheets | A4/A3/Letter/Legal/Tabloid/custom; mm/cm/in/pt; bleed, gap, margin, crop marks, numbering | Imposition panel |
| Barcodes | Not yet available | Real QR/1D rendering is planned |

### Known limitations

- UI is English-only (multi-language support was removed in v0.3.1).
- Barcode/QR rendering is not yet available (planned).
- One photo is matched per row; per-placeholder photo mapping is not
  available.
- PSD bytes are not persisted between sessions — re-upload per session.

---

*ID Stack is open source (MIT). Issues and feature requests:
[github.com/theprabir/ID-Stack-Web/issues](https://github.com/theprabir/ID-Stack-Web/issues).*
