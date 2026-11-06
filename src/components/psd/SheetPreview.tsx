import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  ScanEye,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ImpositionSettings } from '@/services/impositionTypes';
import {
  arrangeSheets,
  cardNumbersForSlots,
  computeSheetLayout,
  recordsPerSheetFor,
} from '@/services/impositionTypes';
import { renderSheetPreview } from '@/services/impositionService';
import { Button, Checkbox, Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Preview width in px at 100 % zoom */
const BASE_WIDTH = 560;
/** Thumbnail strip width in px */
const THUMB_WIDTH = 76;
/** Maximum thumbnails rendered at once (keeps long jobs responsive) */
const MAX_THUMBS = 120;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

interface SheetPreviewProps {
  /** Sample front canvases (row order) */
  fronts: HTMLCanvasElement[];
  /** Sample back canvases (same order as fronts) */
  backs: HTMLCanvasElement[];
  settings: ImpositionSettings;
  /** Physical sheets the whole job will produce (may exceed the sample pages) */
  totalSheets: number;
  /**
   * Exact artwork trim size in points (px ÷ DPI × 72). The preview is laid out
   * from this value, so it shows the same 1:1 card placement the PDF uses.
   */
  cardSizePt?: { width: number; height: number };
  /** True while sample cards are being composited */
  isRendering: boolean;
}

/**
 * Imposed-sheet preview with page navigation, thumbnails, zoom and a
 * trim + safe-area proof overlay (v0.7.4). The overlay is preview-only: the
 * exported PDF contains just cards, crop marks and numbering.
 *
 * The preview is rendered by the same geometry code as the exported PDF
 * (`renderSheetPreview`), so what is shown is what prints — the only
 * difference is that only the first page(s) carry real sample cards; the
 * remaining pages are shown as their (identical) empty layout.
 */
export function SheetPreview({
  fronts,
  backs,
  settings,
  totalSheets,
  cardSizePt,
  isRendering,
}: SheetPreviewProps): JSX.Element {
  const layout = useMemo(
    () => computeSheetLayout(settings, undefined, cardSizePt),
    [settings, cardSizePt]
  );
  const sheets = useMemo(() => {
    if (!layout) return [];
    return arrangeSheets(fronts, backs, layout, settings.arrangement, settings.duplex);
  }, [fronts, backs, layout, settings.arrangement, settings.duplex]);
  // Record indices arranged exactly like the cards: every slot then knows which
  // record it shows, so a front and its back print the same card number.
  const recordIndexSheets = useMemo(() => {
    if (!layout) return [];
    const indices = fronts.map((_, index) => index);
    // Match the cards exactly: only pass back indices when back faces exist,
    // otherwise the arrangement would pair rows that hold plain records.
    return arrangeSheets(
      indices,
      backs.length > 0 ? indices : [],
      layout,
      settings.arrangement,
      settings.duplex
    );
  }, [fronts, backs, layout, settings.arrangement, settings.duplex]);
  const recordsPerSheet = useMemo(
    () =>
      layout ? recordsPerSheetFor(layout, settings.arrangement, backs.length > 0) : 1,
    [layout, settings.arrangement, backs]
  );

  const pageCount = Math.max(totalSheets, sheets.length, 1);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [proof, setProof] = useState(false);
  const pageHost = useRef<HTMLDivElement | null>(null);
  const [thumbs, setThumbs] = useState<{ page: number; url: string }[]>([]);

  // Keep the page index inside the job when settings change the sheet count.
  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  // Main page render.
  useEffect(() => {
    const host = pageHost.current;
    if (!host) return;
    const canvas = renderSheetPreview(
      sheets[pageIndex] ?? [],
      settings,
      Math.round(BASE_WIDTH * zoom),
      {
        cardSizePt,
        proof,
        // Same record-based values as the PDF: continuous runs on, per-sheet
        // restarts, and a record's two faces share the number.
        cardNumbers: cardNumbersForSlots(
          recordIndexSheets[pageIndex] ?? [],
          settings.numbering,
          recordsPerSheet
        ),
      }
    );
    if (!canvas) {
      host.replaceChildren();
      return;
    }
    canvas.style.maxWidth = zoom > 1 ? 'none' : '100%';
    canvas.style.height = 'auto';
    canvas.style.borderRadius = '2px';
    host.replaceChildren(canvas);
    return () => host.replaceChildren();
  }, [sheets, recordIndexSheets, pageIndex, settings, zoom, proof, cardSizePt, recordsPerSheet]);

  // Thumbnail strip: debounced so typing in the settings fields stays smooth.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const next: { page: number; url: string }[] = [];
      for (let page = 0; page < Math.min(pageCount, MAX_THUMBS); page += 1) {
        const canvas = renderSheetPreview(sheets[page] ?? [], settings, THUMB_WIDTH, {
          cardSizePt,
          cardNumbers: cardNumbersForSlots(
            recordIndexSheets[page] ?? [],
            settings.numbering,
            recordsPerSheet
          ),
        });
        if (canvas) next.push({ page, url: canvas.toDataURL('image/png') });
      }
      if (!cancelled) setThumbs(next);
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sheets, recordIndexSheets, pageCount, settings, cardSizePt, recordsPerSheet]);

  const goPrevious = (): void => setPageIndex((current) => Math.max(0, current - 1));
  const goNext = (): void => setPageIndex((current) => Math.min(pageCount - 1, current + 1));
  const hasSampleContent = Boolean(sheets[pageIndex]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar: page navigation + zoom + proof overlay */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={goPrevious}
            disabled={pageIndex === 0}
            aria-label="Previous sheet"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Sheet</span>
            <Input
              type="number"
              min={1}
              max={pageCount}
              value={pageIndex + 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  setPageIndex(Math.min(pageCount - 1, Math.max(0, Math.round(value) - 1)));
                }
              }}
              aria-label="Sheet number"
              className="h-7 w-14 text-center text-xs"
            />
            <span className="text-muted-foreground">of {pageCount}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={goNext}
            disabled={pageIndex >= pageCount - 1}
            aria-label="Next sheet"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - 0.25).toFixed(2))))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + 0.25).toFixed(2))))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            Fit
          </Button>
        </div>
      </div>

      {/* Proof overlay toggle + legend */}
      <div className="mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sheet-proof-mode"
            checked={proof}
            onChange={(event) => setProof(event.target.checked)}
          />
          <Label htmlFor="sheet-proof-mode" className="text-xs">
            <ScanEye className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Trim &amp; safe-area proof
          </Label>
        </div>
        {proof && (
          <ul className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-blue-500" />
              Trim line (cut here)
            </li>
            <li className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 border-t border-dashed border-fuchsia-500" />
              Safe area (3 mm)
            </li>
            <li className="text-muted-foreground/80">Guides are preview-only</li>
          </ul>
        )}
      </div>

      {/* Page canvas (scrolls when zoomed beyond the panel width) */}
      <div className="themed-scrollbar relative min-h-48 flex-1 overflow-auto rounded border bg-surface-card p-1">
        <div ref={pageHost} className="flex justify-center" />
        {isRendering && (
          <p
            className="absolute inset-x-0 top-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Rendering preview cards…
          </p>
        )}
      </div>

      {!hasSampleContent && (
        <p className="mt-1 shrink-0 text-[11px] text-muted-foreground">
          Sample cards are shown on the first page(s); this page uses the same layout with
          empty slots.
        </p>
      )}

      {/* Thumbnail strip */}
      <div className="themed-scrollbar mt-2 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
        {thumbs.map(({ page, url }) => (
          <button
            key={page}
            type="button"
            onClick={() => setPageIndex(page)}
            aria-label={`Sheet ${page + 1}`}
            aria-current={page === pageIndex ? 'page' : undefined}
            className={cn(
              'relative shrink-0 overflow-hidden rounded border bg-white transition-all',
              page === pageIndex
                ? 'border-primary ring-2 ring-primary/40'
                : 'border-border/60 hover:border-primary/60'
            )}
          >
            {url ? (
              <img src={url} alt="" className="block h-auto w-[76px]" />
            ) : (
              <span className="block h-[104px] w-[76px]" />
            )}
            <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[10px] leading-4 text-white">
              {page + 1}
            </span>
          </button>
        ))}
        {pageCount > MAX_THUMBS && (
          <span className="shrink-0 self-center px-1 text-[10px] text-muted-foreground">
            +{pageCount - MAX_THUMBS} more
          </span>
        )}
      </div>
    </div>
  );
}
