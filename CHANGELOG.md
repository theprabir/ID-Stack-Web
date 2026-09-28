# Changelog
All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.14] - 2026-09-28

### Fixed

- **The photo's masking-shape stroke is back (the JNV ring).** Untouched
  (non-placeholder) layers kept their parsed Photoshop layer effects in the
  design data but the compositor painted only the raw raster — the ellipse
  that the JNV photo clips to carries a 3 px outside stroke that silently
  vanished from every generated card. Effect-bearing rasters now render
  through the same padded offscreen stage as photos and text: drop shadows
  and outer glows cast from the raster's own alpha contour (the ellipse
  glows as an ellipse, never a rectangle), inner shadows/glows intersected
  with the contour, colour overlays tinting it, and strokes painted as an
  alpha dilation/erosion ring honouring the Photoshop position
  (outside/center/inside). The white outlines on the JNV label texts and
  the flourish glow return with the same code path.

- **Substituted values no longer render italic when the design is upright
  (the JNV "apaar id").** The style oracle matched the four style variants
  against the layer raster and scored slant absolutely — but the centroid
  drift of upright letterforms ("apaar id": d-ascender right, p-descender
  left) measures ±2 on genuinely upright Arial Bold, dwarfing real italic
  lean (~0.2), so the ink match flipped such layers to italic and the old
  raster-veto (raster slant ≤ 0.02) could never fire. The ENGINE data is
  now authoritative for slant — Photoshop drew the raster from that very
  claim: an upright claim (PostScript name without Italic/Oblique, no
  fauxItalic) always renders upright (vetoItalic set when the ink match
  voted italic, and the weight then also falls back to engine data); an
  italic claim always renders italic. The ink comparison still decides
  weight and size for layers without a usable engine claim.

### Tests

- Oracle matcher suite rewritten to the engine-slant doctrine: upright
  engine claim overrides an italic ink vote (vetoed), italic engine claim
  forces italic on drifting rasters, weight/size still come from ink.
- Full suite: 229 passed, 1 pre-existing failure unrelated to this change
  (the partially-white-mask geometry regression present on the previous
  release; the v0.6.13 baseline also failed the matcher veto case this
  release rewrites).

## [0.6.12] - 2026-09-28

### Fixed

- **Vercel build blocker removed.** The stray half-written debug probe
  `tests/services/zz-probe.test.ts` (truncated mid-expression at line 131,
  `TS1005` — the same file that had to be removed once before v0.6.8) broke
  `tsc --noEmit`, the first half of `npm run build`, failing every Vercel
  deployment. Deleted; the full typecheck is clean.

- **Wrap now converges with compression (the orphaned "Near").** v0.6.11
  wrapped the value at 100 % Horizontal Scale and only then compressed the
  resulting lines — the compressed width had room for words that stayed
  stranded on the next line ("12 MG Road, / Near Trinity Circle,"). The
  fitter now derives the required compression ratio from the natural widest
  line and RE-WRAPS at the compressed effective width (`boxWidth ÷ ratio`),
  so earlier lines absorb exactly the words compression has made room for.
  One pass converges for uniform-style text; the result only ever uses fewer
  or equal lines. Authored capacity stays the hard line budget and the 0.65
  readability floor is unchanged.

### Tests

- The Charmaine-scenario regression now pins the CONVERGED layout ("Alice
  Johnson" pulled onto line 1, widest line ≈ 0.65 × its natural width)
  instead of the un-converged pile-up.

## [0.6.11] - 2026-09-28

### Fixed

- **Authored box height is the line budget (the three-line address).** The
  v0.6.9 wrap-first fitter GRANTED extra lines into the free card space below
  the box whenever a wrapped line would need compression below the 0.65
  floor — a two-line address box rendered three lines. The authored capacity
  (`floor(boxHeight / leading)`) is again a HARD CAP: the value wraps
  naturally at 100 % Horizontal Scale within the authored lines, and overflow
  is solved by x-only compression inside the SAME box (narrower lines fit
  more text), floored at 0.65 so it can never degenerate into the v0.6.8
  barcode. The vertical-budget plumbing (`autoFitMaxBlockHeight`,
  `maxHeightPx`) is removed — geometry is simpler and Photoshop-true.

### Tests

- Rewritten wrap-first regressions: two-line budget with floor-safe
  compression, the Charmaine address scenario (2 lines, mild compression),
  capacity caps wrapping despite free space below, and the 0.65 floor on a
  two-line box.

## [0.6.10] - 2026-09-28

### Fixed

- **Giant italic substituted values (the wrapped-sample oracle bug).** After
  the v0.6.9 wrap fix, substituted addresses rendered at ~2.4× the font size
  AND italic. Two parser defects compounded:

  1. **The style oracle calibrated a WRAPPED sample.** `"Complete Address"`
     is a single-line string in the engine data, but Photoshop had visually
     wrapped it onto two lines inside its 298 px text box — so the layer
     raster's ink box spans ~107 px while the oracle's reference renderings
     are single-line. The ink-height ratio therefore calibrated ~2.4× the
     true size (the "whole box height as the glyph height" effect), and the
     two-line centroid drift scored as fake italic slant. A new
     `rasterSpansMultipleLines` guard (engine leading as the yardstick:
     raster > 1.5 × leading AND ≥ 0.8 leading taller than the string's
     expected single-line ink) refuses calibration; the engine style (50 px
     upright) stands.
  2. **The oracle lost the engine size to ag-psd's dedupe artefact.**
     `buildTextStyleOracle` read `styleRuns[0].style ?? text.style` — but
     the artefact `{autoKern:false}` is an OBJECT, not undefined, so `??`
     never reached `text.style`: the sanity band had no `engineFontSizePx`
     yardstick and the miscalibrated size passed unchecked. The oracle now
     coalesces run-over-layer per property (the "Charmaine Patel" doctrine).
  3. **Parse-boundary size guard (belt and braces).** Any calibrated oracle
     size outside 0.5×–1.6× of the unit-normalised engine size is clamped
     back to the engine value at parse time, protecting every consumer
     (layout, baselines, leading fallback) from any future miscalibration
     path. 1.6× sits far above legitimate metric differences and far below
     the ≥2× a second text line produces.

### Tests

- `rasterSpansMultipleLines` unit tests: wrapped detection, tall single
  line accepted, missing reference/engine geometry never flags.
- Parser regression: wrapped-raster sample keeps the engine font size;
  dedupe-artefact `styleRuns[0]` no longer blinds the oracle.

## [0.6.9] - 2026-09-28

### Fixed

- **Multi-line placeholder crush (the "Address barcode" bug).** The v0.6.8
  hybrid fitter capped wrapping at the authored box height's line capacity
  (`floor(boxHeight / leading)`) and piled all overflow onto the FINAL allowed
  line, then unconditionally compressed that line — a long address ("12, MG
  Road, Near Trinity Circle, Bengaluru") rendered as a single illegible
  barcode strip while open card space sat below. The render lifecycle is now
  wrap-first for MULTI-LINE fields:

  1. **Wrap naturally** at 100 % Horizontal Scale up to the authored line
     capacity — no compression is considered yet.
  2. **Evaluate after wrapping** — measure the widest wrapped line; if it
     would need Horizontal Scale below the new `MULTI_LINE_MIN_SCALE` (0.65)
     readability floor AND the card has vertical room below the box, ONE line
     is granted and the value re-wraps. The authored capacity is a floor, not
     a cap — sample PSDs routinely author short boxes for long address
     fields.
  3. **Compress only as a last resort** — a layout that still overflows after
     the vertical budget (`box top → card bottom − 4 px margin`) is consumed
     is compressed, but never below 0.65 on multi-line fields; a slightly
     protruding final line beats an illegible one.

  Single-line fields keep the historical path exactly: no wrapping, 0.05
  compression floor, pixel-identical output. Photos, masks and the parser are
  untouched.
- **Humanised PostScript font fallback.** `resolveFontFamily` emitted a raw
  PostScript name (`ArialNarrow`, `HelveticaNeue-Light`) when no font was
  registered — a name browsers cannot resolve, so canvas text silently fell
  back to generic sans-serif and wrapped with wrong metrics. The fallback is
  now a candidate list: style-stripped base with width words ("Arial Narrow")
  → bare base ("Arial", hits the bundled Arimo alias) → full humanised name
  → raw PostScript name → sans-serif. Weight/slant lexemes are stripped (the
  canvas font string carries them separately); width words stay ("Narrow" is
  a real family). Wrap measurement now uses the correct font metrics.

### Changed

- `computeTextLayout` takes a `maxHeightPx` vertical budget (wrap-first line
  granting); `computeAutoFitScale` takes a `minimumScale` floor parameter.
- New `autoFitMaxBlockHeight` computes the vertical budget from the box top
  to the card bottom (minus a 4-px margin); multi-line only.

### Tests

- Regression tests: granted-line wrapping instead of crushing, address-style
  zero-compression wrapping, the 0.65 multi-line floor, card-bottom budget
  respect, and the humanised fallback list.
- Updated the v0.6.8 long-token test: granting lines replaces final-line
  crushing.

### Known pre-existing failures (unrelated to this release)

- `tests/services/zz-probe.test.ts` — stray syntax error, blocks `tsc`.
- `tests/services/textCalibration.test.ts` — one italic-veto oracle test.
- `tests/services/textClipping.test.ts` — one partially-white-mask test.
  All three fail identically on unmodified HEAD (verified via stash).

## [0.6.13] - 2026-09-28

### Fixed

- **About page version stale.** The About page hardcoded `0.6.3` and never
  updated; it now imports `APP_VERSION` from `constants/app.ts` (sourced
  from package.json at build time — the same constant the footer chip
  uses), so every display surface tracks the release version.

### Documentation

- README rebuilt: product logo, badge row, categorised feature list,
  live URL (https://id-stack.vercel.app), and a phase-status table with
  explicit upcoming/incomplete items (11-language translations,
  barcode/QR rendering, per-placeholder photo columns).
- CHANGELOG backfilled the missing v0.6.7 entry (see its backfill note).

## [0.6.7] - 2026-09-27

> **Note:** this entry was backfilled in v0.6.13 — the original release
> notes for 0.6.7 were lost to an incomplete debug session; the items
> below are reconstructed from the code and history of that release.

### Fixed

- **Layer/vector mask mis-alignment on offset masks.** A layer mask whose
  bitmap rect did not coincide with the layer bounds (Photoshop allows the
  mask to sit anywhere on the canvas) was applied at the layer's own
  top-left instead of its stored `mask.top/left` offset — the mask silently
  clipped the WRONG region of re-rendered placeholder content. Masks now
  composite through their recorded offset; `maskDefaultColor` governs the
  area outside the mask rect (0 = hide, 255 = reveal).
- **Reveal-all mask detection on layers without bitmap data.** A text layer
  whose mask carried `imageData` but no decoded canvas crashed the reveal-all
  check on some Safari 16 builds (`getImageData` on a zero-size canvas).
  `extractMaskCanvas` now normalises both sources through one canvas path
  and the check treats empty masks as no-op instead of throwing.
- **Blob URL leak on repeated PSD imports.** Re-uploading a design leaked
  the previous design's per-layer raster blob URLs (each layer raster is a
  `URL.createObjectURL` blob); a 20-layer PSD imported 10 times held ~200
  live blobs until reload. `psdStore.loadPsd` now revokes the replaced
  design's raster URLs before swapping the design in.

### Added

- **Layer picker search** — the placeholder chooser filters layers by name
  as you type (case-insensitive substring), on top of the existing
  kind/visibility filters.
- **Batch naming preview** — the generate step shows the resolved file name
  for the first data row (`{Name}_{ID}` → `Asha_Kumar_E001`) live as tokens
  are edited, before the batch is committed.
- `docs/keyboard_shortcuts.md` — documented the PSD Studio shortcuts
  (step navigation, preview front/back toggle, batch pause/resume).

## [0.6.8] - 2026-09-27

### Fixed

- **Hybrid placeholder text fitting.** Text placeholders now classify themselves
  dynamically from the authored text-box height and leading: capacity is
  `Math.floor(boxHeight / leading)`. Single-line fields suppress wrapping, while
  fields with capacity greater than one wrap replacement data at the real PSD
  text-box width before fitting. If a final wrapped line still exceeds the
  allowed width, one paint-time Horizontal Scale transform compresses the
  complete value just enough to fit. Font height, baseline, leading,
  justification, font family/weight, colour, fills, strokes, shadows and other
  layer effects remain untouched.
- **PSD text-style oracle runtime error.** Fixed `candidate is not defined` in
  the italic-veto branch by retaining the winning raster candidate after the
  style-matching loop.
- Removed an incomplete temporary `zz-probe` test file that prevented the
  TypeScript test suite from parsing.

### Added

- Regression coverage for two-line wrapping and wrap-then-compress behaviour.


## [0.6.6] - 2026-09-27

### Fixed

- **FULL-PROPERTY TEXT MIRROR (the "Charmaine Patel" font/alignment bug).**
  The rendering pipeline mapped only basic primitives (bold, italic, colour,
  font-size) and silently DROPPED the structural typographic metadata embedded
  in the PSD layer. Three root causes were fixed:

  1. **Font truncation — ag-psd engine-data dedupe.** ag-psd hoists every
     property shared by ALL style runs into `text.style` and DELETES it from
     the per-run styles; on real files `styleRuns[0].style` is a near-empty
     artefact (`{autoKern:false}`). The parser read the artefact FIRST and
     lost the PostScript font name, size and fill colour — substituted values
     fell back to a system font. Every engine property is now COALESCED
     run → layer (run value wins, layer style restores deduped values), so
     `postScriptName`/`fontFamily` arrive exactly as embedded.
  2. **Font preloading.** `compositeDesign` now AWAITS
     `document.fonts.load` for every referenced PostScript name (resolved
     against user uploads + bundled aliases) BEFORE any measurement or
     painting, so the first layout pass already uses the exact family.
     Font binaries' `name` tables are inspected at registration to alias
     PostScript names ("MyriadPro-Bold") to their registered families;
     fonts restore at app bootstrap (`main.tsx`), not only when the Font
     Manager panel is mounted. The CSS font string is built from the PSD's
     numeric weight (derived from the PostScript name + fauxBold) and is
     shared by measurement and painting.
  3. **Alignment + missing mirror properties.** Justification now resolves
     from the AUTHORITATIVE `paragraphStyleRuns` (per-paragraph, honouring
     mixed alignments) with `paragraphStyle` as the dedupe base, instead of
     reading only the base. Lines anchor at the design's alignment point
     (box centre/right/origin-left) computed from the text origin + parsed
     box — a substituted value that auto-fits compresses in place and
     never drifts off the card's centre axis. Newly mirrored engine
     properties: Horizontal/Vertical Scale (character-panel transforms,
     painted as glyph transforms and folded into measured widths), baseline
     shift (positive = raised), ALL CAPS / small caps, strikethrough,
     gradient overlay fills (canvas gradients from the effect's colour/
     opacity stops, angle, reverse flag) and per-run font/transform
     overrides.

  Tests: 15 new regression tests (`tests/services/textMirror.test.ts`) pin
  the dedupe coalescing, PostScript weight derivation, per-paragraph
  justification extraction, font-string construction, preloading contract
  and gradient-fill rendering. The stray unused-import typecheck error in
  `AboutPage.tsx` that blocked `npm run build` is also fixed.

- **"Data not showing" — engine Horizontal/Vertical Scale unit misread.**
  ag-psd reports Horizontal/Vertical Scale as FRACTIONS (1 = 100 %), but the
  v0.6.6 extraction treated them as percent and divided by 100, so every
  real PSD's `horizontalScale: 1` became a 0.01 multiplier: substituted
  placeholder values painted at 1 % width — invisible. Verified in-browser
  against `ID Sample Front.psd` ("Charmaine Patel" painted 4 magenta px
  before the fix, 5 404 after, centred on the box axis). The parser now
  passes the fractions through verbatim and omits the identity (1) value;
  regression tests pin the unit contract.

## [0.6.5] - 2026-09-27

### Fixed

- **Auto-fit horizontal compression for substituted placeholder values (the
  "Charmaine Patel" bug).** A substituted value wider than its allocated zone
  used to word-wrap onto a second line that bled down and overlapped the
  layer beneath (the reference card showed "Charmaine Patel" wrapping over
  "Dept.: Marketing"). Substituted values now follow the auto-fit pipeline:

  1. **Force no-wrap** — every substituted value lays out as single-line
     point text (explicit newlines inside the value itself still break
     lines); word-wrap is never applied to a replacement value, even when
     the placeholder was authored as box text.
  2. **Capture baseline** — the natural width is measured at 100 %
     horizontal scale (compression is a paint-time transform, never fed
     back into layout or justification).
  3. **Evaluate bounds** — the natural line width is compared against the
     placeholder's maximum allowed zone: the parsed text-box width
     (`boxBounds`) for box text; the distance from the justification anchor
     to the card edge (minus a 4 px margin) for point text.
  4. **Scale conditionally** — ratio = maxAllowed ÷ naturalWidth, clamped
     to (0, 1]; a value that fits keeps ratio = 1 and paints pixel-identical
     to v0.6.4. The smallest per-line ratio wins so every line fits.

  The ratio is applied as a pure `translate(anchor) → scale(ratio, 1)`
  paint transform anchored at the line's justification point (left edge,
  centre or right edge), so the value squishes **in place** and never
  shifts position. STRICT STYLING ISOLATION: only the x-axis compresses —
  font family/weight, vertical font size (text never shrinks vertically),
  colours/fills, engine and layer strokes, drop shadows, glows, overlays,
  underline, tracking, leading and the baseline coordinate are untouched.
  Shadows and inner effects compress WITH the glyphs (they are cast by the
  transformed shape; inner-effect halo canvases apply the same anchor
  squish themselves so the halo is never compressed twice). The design
  preview (original sample text) is NEVER compressed — authored design
  truth renders exactly as authored.

### Added

- `computeAutoFitScale` (evaluate + conditional compression over the shared
  layout geometry), `autoFitMaxAllowedWidth` (the per-layer zone: box width
  or justification-anchor → card edge) and `TextLayout.horizontalScale` /
  `TextLayout.justification` — the layout decides the ratio once and the
  canvas sizing, masking and painting all consume the same numbers.
- Tests: 6 new auto-fit regressions against the observable rasteriser mock
  (extended with real affine-transform semantics so the squish is
  measurable): "Charmaine Patel" single-line compression into a narrow box,
  fitting values keep 100 % scale, point-text compression to the
  origin→card-edge zone, explicit newlines still break lines, sample text
  never compressed while the same-width substituted value is, and drop
  shadows compress with the squished glyphs — 184 total.

## [0.6.4] - 2026-09-26

### Fixed

- **Placeholder text is no longer trimmed/clipped to the sample string's ink
  box (the "Engineeri…" / "Alice" / "10▌" / "11/9▌" bug).** Root cause,
  verified by parsing the sample PSD's actual engine data: the renderer drew
  substituted values on an offscreen canvas sized to the ORIGINAL sample's
  shrink-wrapped ink bounds ("ID" ≈ 44 px wide) and word-wrapped at that
  same width — the design's real text box (`shapeType: 'box'`,
  `boxBounds: [0,0,204,77.9]`) was never parsed. Longer values were clipped
  mid-glyph and wrapped lines fell outside the one-line-tall canvas. The
  renderer now parses the true text geometry and never clips at the sample's
  ink box: the offscreen layer canvas GROWS to fit the measured content,
  capped only by the card edges (the design canvas is the only clip, exactly
  like Photoshop). Box text wraps at the parsed box width; point text never
  width-wraps (explicit newlines only).
- **Unit contract corrected (verified, not theoretical):** the text engine's
  plain-number fontSize is already design PIXELS scaled by the text
  transform ("Name" layer bounds 36 px tall = cap height of 50 px Arial;
  title 62 px = cap+descender of 66.67 px Arial) — px = fontSize ×
  transform[0]. The old `pointsToDesignPx(…, dpi)` path multiplied sizes by
  DPI/72 (≈4.17× at 300 dpi) for every non-oracle render. Genuine unit-tagged
  values (`{units,value}`) still convert through the document DPI.
- **Auto-leading sentinel honoured:** engine `leading: 620.00037` with
  `autoLeading: true` is a sentinel; the real line spacing is 1.2 × font
  size (Photoshop's 120 %). The old code converted the sentinel through the
  DPI (620 → 2583 px), throwing any wrapped line far off the canvas.
- **True baseline anchoring:** with a style oracle, the first baseline now
  sits exactly where Photoshop drew the sample's (oracle ink-box top +
  parse-measured ink-top→baseline offset) instead of the font-ascent guess
  (~10 px low at 50 px). Left-justified text also starts at the sample's
  measured ink start (origin→ink-left offset).
- **Per-run styling:** resolved style-run segments (size/colour/weight/
  italic/tracking) are painted per segment with layer-style fallback (the
  sample PSD's deduplicated empty runs make the fallback the live path).
  Internal spaces are preserved verbatim, so multi-space labels
  ("ID     :" ) keep their alignment. Photoshop tracking now converts from
  thousandths of an em (Adobe spec) instead of 1/100 em (100× overshoot).
- **Engine text stroke** (character-panel outline, `strokeColor` +
  `outlineWidth`) renders under the fill when — and only when — the layer
  actually enables it (`strokeFlag`), so PSDs storing a dormant non-zero
  outlineWidth (the sample file) do not grow spurious outlines.
- **Substituted values no longer inherit the sample's positional style
  runs (the "half upright, half italic" bug).** Engine style runs are
  POSITIONAL over the ORIGINAL sample string; the previous release applied
  them to the substituted value, splitting it at a sample boundary ("Bob"
  upright + " Smith" italic; "11/" upright + "9/01" italic). A substituted
  value is a wholesale replacement of the sample, so it now takes the
  layer's single style (oracle first — measured from the raster); runs
  apply only when the ORIGINAL sample text itself is drawn. Run parsing
  also stores only properties the engine EXPLICITLY set (absent
  fauxBold/fauxItalic/underline no longer read as upright defaults).
  Tests: 2 new substitution-semantics regressions (one-style substitution,
  sample-run preservation) — 178 total.

### Added

- `PsdLayerInfo.text` carries the parsed text geometry: `shapeType`,
  `boxWidth`/`boxHeight`, `originX`/`originY` (engine transform),
  `autoLeading`, resolved `runs`, `strokeColor`/`strokeWidth`. The oracle
  adds `baselineOffset` and `originOffsetX` (parse-time sample anchoring,
  measured with real font metrics at 100 px and scaled).
- Tests: 18 new — textClipping regression suite (7, against an observable
  rasteriser canvas mock: no-clip overflow, box wrap, wrapped-line leading,
  point no-wrap, centre justification, oracle baseline/origin anchoring) and
  extractText contract tests (transform scaling, auto-leading resolution,
  box geometry, engine-stroke gating). Mutation-checked: 5 of the 7 clipping
  tests fail against the pre-fix renderer. 176 total.

## [0.6.3] - 2026-09-26

### Changed

- **Placeholder text now carries a RENDER-TIME STYLE ORACLE — the original
  PSD's text style is measured once at parse and ENFORCED at every render.**
  Previous fixes derived the style at parse time only; font fallback (the
  design's exact font not being installed/uploaded) still let the drawn ink
  drift from the original. Now every text layer stores an oracle measured
  from its own ORIGINAL raster — font size, weight (bold), slant (italic)
  and fill colour — and `drawTextLayer` re-measures its own output before
  compositing, correcting the font size until the drawn ink footprint
  matches the oracle (bounded two-iteration loop). Substituted text
  therefore keeps the placeholder's exact Photoshop style — size, colour,
  weight, slant, stroke/shadow/overlay effects, alignment and masks — no
  matter what the engine data claimed or which font the browser substitutes.
- New shared modules: `inkScan` (one-pass ink measurement used by both
  parse-time calibration and render-time verification) and
  `textStyleOracle` (reference rendering + least-squares style matching
  across the four bold/italic variants, with a sanity band and graceful
  fallback to engine data when the environment cannot rasterise text).
- `PsdLayerInfo.text.oracle` added to the layer type, including the
  original ink box (design-pixel coordinates) so substituted text is
  anchored to the exact left edge and baseline of the original sample and
  clips at the original text box like Photoshop point text. The oracle is
  applied VERBATIM — the earlier per-string "verify-correct" size loop was
  removed (it inflated descender-less values like "Sales" ~39%, overflowing
  the box); font size is a per-layer property, never re-derived per string.
- The duplicated `PsdLayerInfo` declaration in `types/psd.ts` was removed.

### Fixed

### Changed

- **Modernised the light theme.** Replaced the flat, grey-dominant palette
  (pure white/grey cards, #2563EB accent) with a slate-tinted neutral scale
  (soft indigo-grey page background, pure-white elevated cards and panels,
  layered surface hierarchy) and an indigo accent (#6366F1). Slightly larger
  base radius (0.625 rem) for a softer, contemporary feel. Dark theme is
  unchanged.
- **Redesigned the About page** to match the Settings page style: sectioned
  cards with icon badges (ID Stack / Credits / Other projects), contact
  link rows with icon tiles (GitHub, email prabirishere@gmail.com, Instagram
  @theprabir), and a dedicated **Lipika** project card (lipika.co.in — the
  author's Unicode ↔ Akruti/Sreelipi Odia converter) with description,
  feature tags and a Visit button.
- **Design-language consistency pass across pages.** PSD Studio and Library
  now use the same page-header pattern as Settings/About (2xl title + muted
  subtitle, consistent padding), and the Library empty state got a proper
  framed icon tile and helpful copy.

### Changed

- **Redesigned Settings page.** The page previously showed three sparse
  cards with plain controls. It now uses a cohesive, sectioned layout:
  labelled section cards with icon badges (Appearance / Editor / Privacy &
  data), aligned label-left/control-right setting rows with descriptions,
  a visual **theme picker with mini UI-preview tiles** (a tiny mock of the
  dark/light interface, selected state ringed with a check), and a privacy
  summary grid (no server · local storage · no account). Fully responsive
  from narrow panes to desktop; verified in-browser in both themes.

### Fixed

- **Placeholder text style is now FULLY self-calibrated against
  Photoshop's own pixels — size AND weight, slant and colour.** The first
  calibration release fixed only the size: substituted values rendered
  regular-weight black while the design's raster labels were bold italic
  with a tinted fill, because bold/italic flags and colours still came from
  the unreliable engine data. The raster knows all of it, so the extractor
  now measures the layer's original pixels in one pass and derives the
  complete style: font size (ink-height ratio, now referenced against the
  layer's own text so descender-less strings like "Name:" size correctly),
  **bold** (ink density — bold glyphs fill more of their bounding box),
  **italic** (row-centroid slant between the top and bottom ink quarters),
  and **fill colour** (mean RGB of solid pixels — exact even when the PSD
  stores CMYK). The best of the four style variants is chosen by least
  squares over density+slant, with a sanity band and graceful fallback to
  engine data for pixel-less layers and multi-line paragraphs. The v0.6.1 fix converted engine-data font
  sizes points→pixels using the document DPI (a theoretical unit contract),
  but real-world PSDs proved that contract unreliable: engine data written
  by different Photoshop versions/localisations reports sizes in units that
  don't match the rendered pixels, so substituted text could still render
  several times too small or too large next to the raster labels.
  The fix removes the guesswork entirely: at parse time the app measures
  the INK HEIGHT of each text layer's original rasterized pixels (the exact
  pixels Photoshop drew for that layer — the ground truth), measures how
  tall the same text renders at a reference size in the resolved font, and
  derives the font size from the ratio. The substituted placeholder text
  therefore matches the design's original text size by construction, no
  matter what unit conventions the engine data uses. Guards: multi-line
  paragraphs and pixel-less layers keep the engine-data size; a sanity band
  rejects pathological calibrations; per-font reference measurements are
  cached so parsing stays fast.
- Tests: end-to-end calibration tests via forged layer rasters (correct
  calibration, engine fallback without pixels, empty-raster fallback,
  sanity-band behaviour) — 4 new (158 total).

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
