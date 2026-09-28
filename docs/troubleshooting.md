# ID Stack — Troubleshooting Guide

Symptom-first fixes for common problems. Find what you're seeing, apply the
fix, and check the linked section if you need the why.

> **Companion documents:** [User manual](user_manual.md) ·
> [Keyboard shortcuts](keyboard_shortcuts.md)

**Quick checklist before anything else**

1. Use an up-to-date browser: Chrome/Edge 110+, Firefox 115+ or Safari 16+.
2. Hard-refresh the page (`Ctrl+Shift+R` / `Cmd+Shift+R`) — the app updates
   via a service worker and a refresh picks up the newest version.
3. Try the bundled sample data (`sample-data/` in the project repository) to
   confirm the app itself works before blaming your files.
4. Check the **Data & Validation** panel (Step 3) — most data problems are
   listed there with exact row numbers.

---

## Table of contents

1. [The app won't load or looks broken](#1-the-app-wont-load-or-looks-broken)
2. [PSD design problems](#2-psd-design-problems)
3. [Text renders wrong on generated cards](#3-text-renders-wrong-on-generated-cards)
4. [Excel & data problems](#4-excel--data-problems)
5. [Photo problems](#5-photo-problems)
6. [Font problems](#6-font-problems)
7. [Batch generation problems](#7-batch-generation-problems)
8. [Printing problems](#8-printing-problems)
9. [Storage & persistence problems](#9-storage--persistence-problems)
10. [Editor problems](#10-editor-problems)
11. [Reporting a bug](#11-reporting-a-bug)

---

## 1. The app won't load or looks broken

**Blank page, or the layout looks wrong**

- Hard-refresh (`Ctrl+Shift+R`). An old cached service worker can serve a
  stale bundle after an update; one refresh re-registers the current one.
- Check for browser extensions that inject scripts (ad blockers, dark-mode
  extensions) — try a private/incognito window.
- Confirm the browser version meets the minimum (Chrome/Edge 110+,
  Firefox 115+, Safari 16+). ID Stack uses modern APIs (OffscreenCanvas-era
  Canvas, FontFace, WASM) that older browsers lack.

**The app worked offline before, but now won't open without internet**

- The PWA cache is populated on first visit. If you cleared browsing data or
  used a different browser profile, open the site once online to re-cache it.
- Private/incognito windows don't keep service workers after closing —
  install the app or use a normal window for offline use.

**A specific page is stuck on a spinner**

- The header shows a global loading indicator while fonts/parse work run.
  Parsing a very large PSD (hundreds of MB) can take a while — wait.
- If it truly hangs: hard-refresh, re-upload, and see
  [PSD design problems](#2-psd-design-problems).

---

## 2. PSD design problems

**"Could not parse …" / upload fails immediately**

- Confirm the file is a genuine `.psd`. Renaming a PNG/JPG to `.psd` won't
  work — re-export from Photoshop as Photoshop (PSD) format.
- Very old or exotic PSD variants (large-document format from plugins, 16/32
  bit with unusual compression) may fail. Re-save as a standard 8-bit PSD.
- Try re-uploading once — a corrupted or truncated download/transfer can
  parse-fail.

**"… has no layers. Flatten designs are not usable"**

- The design was saved flattened (or "Maximize compatibility" merged it).
  ID Stack substitutes content *per layer*, so layers are mandatory.
- In Photoshop: keep each variable element (name, photo, ID) on its own
  **named layer**, then re-save.

**CMYK design shows wrong or refuses to load**

- CMYK PSDs are supported (8-bit). If a CMYK file misbehaves, re-save it as
  8-bit CMYK (Image → Mode → 8 Bits/Channel) and retry.
- Report any remaining CMYK case on GitHub — the CMYK reader is patched
  behind a whitelist and edge cases exist.

**The upload preview looks different from Photoshop**

- The thumbnail is ag-psd's composite; blend modes, smart filters and some
  adjustment layers can differ slightly. What matters for output is the
  **generated card** — check the Step 3 live preview before judging.

---

## 3. Text renders wrong on generated cards

**Substituted text is in the wrong font (looks generic)**

- The PSD embeds a PostScript font name; without that exact font, a fallback
  is used. Open the **Fonts** panel (Step 1) and upload the font files
  (`.ttf .otf .woff .woff2`) used in the design.
- After uploading, fonts are matched by name automatically — including
  PostScript aliases (e.g. `MyriadPro-Bold` matches "MyriadPro Bold").
- Arial text works without uploads (an Arial-compatible font is bundled).

**Text is too large, italic, or mis-styled**

- This was the subject of several fixes (v0.6.10's wrapped-sample guard).
  Update to the latest version first (hard-refresh), then re-check.
- If it persists, the likely trigger is an unusual text layer: mixed
  per-character styles, a sample string Photoshop visually wrapped, or faux
  bold/italic. Try simplifying the placeholder layer to a single style, and
  make the sample text representative of real data length.

**Long values are squashed or overflow the card**

- Multi-line fields wrap within the design's text box and then compress
  horizontally — but never below a 0.65 readability floor, so a very long
  value may slightly overflow instead of becoming an illegible strip.
  - Prefer shorter data, or widen the text box in the PSD,
  - or reduce the font size in the design.
- Single-line fields compress aggressively (that's by design for fields like
  names on one line).

**Text position is slightly off**

- Position comes from the PSD's own raster of the sample text. Make sure the
  layer's original sample text is well-aligned in the design — substituted
  values are anchored to where the sample was.
- Descender-less samples ("ID", "SDE") use a metric-based baseline; if a
  specific layer sits wrong, add a temporary descender to the sample text in
  the PSD (e.g. "ID:") and re-upload.

**Capitalisation differs from my data ("john smith" prints as "JOHN SMITH")**

- The layer honours the PSD's character setting (ALL CAPS / small caps).
  Change it in Photoshop if you want raw case.

---

## 4. Excel & data problems

**"Unsupported file type"**

- Only `.xlsx`, `.xls`, `.csv` are accepted. Export Google Sheets via
  File → Download → Microsoft Excel (.xlsx) or CSV.

**"The spreadsheet needs a header row and at least one data row"**

- Row 1 must contain column names; row 2+ the data. Re-export including the
  header.

**Only some rows / columns appear**

- Only the **first sheet** of a workbook is read. Move your data to the
  first sheet.
- Blank rows are skipped; columns with duplicate names get suffixes like
  "Name (2)" — rename them in the source if the suffix confuses mapping.
- Dates are exported as ISO dates (YYYY-MM-DD); phone numbers may lose a
  leading `+` — format such columns as text in Excel before exporting.

**A placeholder shows "—" or the design's original text**

- That placeholder isn't mapped. In Step 3's Column Mapping choose an Excel
  column for it (or press **Auto-map**). Unmapped placeholders are flagged in
  the mapping table and validation report.

**Auto-map didn't map everything**

- It matches placeholder keys to column names case-insensitively and exactly.
  If the layer is named "Employee Name" but the column is "Name", rename the
  mapping key in Step 2 (or the column in Excel) so they match.

**Validation reports errors — can I still generate?**

- Warnings never block. **Errors** (duplicate IDs, empty required fields)
  will still generate for the valid rows — a card with an empty name is
  almost never what you want, so fix the source data and use **Replace** to
  re-import.

---

## 5. Photo problems

**"0 of N photos matched to rows"**

- Check the **Photo mapping mode**:
  - *By card-holder name*: photos must be named after the person
    (`Priya Sharma.jpg` for a row whose name is "Priya Sharma"). Matching is
    lenient about spaces/underscores/case, but the names must otherwise
    agree.
  - *By Excel column*: select the column that holds photo file names —
    extension optional, path tolerated.
  - *Manual*: assign photos per row in the Data & Validation panel.
- Photos whose names match nothing are listed as unused; rename and
  re-import them.

**A row has no photo (blank portrait)**

- The photo window renders empty for that row. Assign one in **Manual**
  mode, or add the missing file. Validation flags missing photos as
  warnings when using column mode.

**Photos look cropped oddly**

- Photos are **centre-cropped** to the placeholder's aspect ratio. If faces
  sit low in your photos, crop them beforehand (head near centre) or make
  the placeholder window less wide.

**Unsupported image type / photos missing after import**

- Accepted: `.jpg .jpeg .png .webp .gif .bmp`. Other formats (HEIC from
  iPhones, TIFF) must be converted first — HEIC especially: export as JPG
  from the phone or use a converter.

---

## 6. Font problems

**Uploaded font doesn't appear in the Fonts list**

- Supported: `.ttf .otf .woff .woff2`. Files with other extensions (or
  invalid/corrupt fonts) are skipped and reported as
  "N file(s) skipped (unsupported or invalid)".
- Fonts register under the **file name without extension** — that's the
  family PSD matching looks for. If your file is `MyFont Bold.ttf`, the
  family is "MyFont Bold"; a PSD asking for PostScript name `MyFont-Bold`
  still matches via the embedded name table.

**Font worked yesterday, missing today**

- Fonts persist in IndexedDB for the same browser/profile. Clearing site
  data, using incognito, or switching browsers loses them — re-upload once;
  it takes seconds.

**Text still renders with a fallback after uploading**

- Confirm the family name matches what the PSD uses (the Fonts panel lists
  registered families; compare with the layer's font in Photoshop).
- Re-generate — fonts register before render, but a card generated in the
  same second as the upload can race; run the batch again.

---

## 7. Batch generation problems

**Generate button is disabled**

- All three gates must pass: at least one design **or** Excel loaded
  (Step 1), at least one placeholder (Step 2), and data ready. The step chips
  and the nav buttons show what's missing.

**Generation is slow**

- Hundreds of cards take minutes — the ETA in the progress bar is accurate.
  Speed scales with card pixel size: a 300-DPI design renders ~4× the pixels
  of 150-DPI.
- Close other heavy tabs; the render loop yields to keep the UI responsive
  but competes for CPU with everything else.
- JPEG output is faster than PDF (PDF adds ICC embedding per file).

**The browser tab crashed or froze during a big batch**

- Very large batches × very large designs can exhaust memory (target is
  < 800 MB). Mitigations:
  - Split the Excel into chunks of a few hundred rows,
  - use JPG instead of PDF for per-card output,
  - keep only one side if the back isn't needed.
- The batch runs entirely in the tab — don't close it. Pause/Resume is safe;
  a crash means re-running.

**"The cards do not fit on the selected paper size" (sheet mode)**

- The imposition maths says card + 2×bleed + gaps + margins exceeds the
  paper. Reduce bleed/gap/margin, switch paper (A3 fits 2× A4), enable
  Landscape, or check that the card size shown is physical (mm), not pixels.
  The fit summary line under the panel shows the computed grid live.

**Errors listed during generation ("Row N: …")**

- Each row renders independently — one failure doesn't stop the rest. The
  message names the cause (unreadable photo, missing column, corrupt data).
  Fix those rows and re-run only if you need complete output.

**ZIP won't download or is empty**

- Pop-up/download blockers can swallow the download — allow downloads for
  the site. The button appears only after the run completes successfully.
- A "ZIP packaging failed" error means the browser refused the final blob
  (usually memory) — see the crash mitigation above.

---

## 8. Printing problems

**Printed cards are the wrong size**

- Print at **100% / Actual size**, never "Fit to page" — scaling breaks both
  card size and crop marks.
- Confirm the imposition paper preset matches the paper in the tray.

**Fronts and backs don't line up when duplex printing**

- Use arrangement **Fronts & backs on separate sheets** with **Duplex
  pairing** enabled, and print with **long-edge binding**. Flip-on-short-edge
  mispairs every row.
- If your printer reverses the sheet order, the pairing still holds per
  sheet — only paper orientation settings affect alignment.

**Crop marks are missing**

- Enable **Crop marks** in the imposition panel (and set length/offset if
  your cutter needs specific values).

**Colours look different in print**

- Output is ICC-corrected CMYK (bundled Ghostscript profile). Screens are
  brighter than print by nature; for critical colour, ask your print shop
  for a proof — the PDF carries a GTS_PDFX OutputIntent and the CMYK JPEG an
  Adobe APP14 marker, so professional workflows can profile further.

---

## 9. Storage & persistence problems

**My settings/templates/imposition layout disappeared**

- They live in the browser's IndexedDB/localStorage for that site, profile
  and browser. Clearing browsing data ("Cookies and site data"), private
  windows, or a different browser all start empty.

**Designs and data vanish after reload**

- By design: PSDs, Excel rows, photos and mappings are session-only
  (browser storage limits). Re-upload after a reload — placeholders,
  imposition settings and fonts survive.

**IndexedDB errors in the console**

- Private browsing modes in Firefox/Safari restrict storage. Use a normal
  window. Also check available disk space — quota errors surface as storage
  failures.

---

## 10. Editor problems

**Shortcut didn't work**

- Shortcuts are ignored while typing in an input/textarea/select (so you can
  type "V" in a name field). Click on empty canvas first.
- The full, accurate list lives in
  [keyboard_shortcuts.md](keyboard_shortcuts.md) — items marked *planned*
  are not implemented yet.

**Element can't be selected or moved**

- It's probably **locked** (padlock in the Layers panel) — unlock it.
- Hidden elements (eye icon) still occupy the list; toggle visibility.

**Undo didn't revert my last change**

- History captures committed changes (move/resize/property edits). Snapshot
  depth is 50 — older steps are dropped.
- Undo does not currently span switching Front/Back tabs mid-edit.

**Saved template isn't there after reload**

- Templates persist only after **Save** (`Ctrl+S`) — or enable
  **Auto-save templates** in Settings. The Save button is enabled only when
  there are unsaved changes.

**Barcode tool shows a labelled box instead of a code**

- Known limitation: barcode/QR rendering is not wired in yet; the tool
  reserves layout space.

---

## 11. Reporting a bug

When filing at
[github.com/theprabir/ID-Stack-Web/issues](https://github.com/theprabir/ID-Stack-Web/issues),
include:

1. Browser + version, OS, app version (footer chip or About page).
2. What you did (steps), what you expected, what happened.
3. The exact error text (upload errors, validation entries, batch error list
   row messages).
4. If possible, a minimal reproduction: a small PSD (2–3 layers), a 2-row
   CSV, and the naming/output options used. **Do not attach real personal
   data** — anonymise names/photos first. Nothing is uploaded anywhere by
   the app itself; attaching files to a GitHub issue is your choice.
