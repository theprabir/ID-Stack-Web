/**
 * Streaming imposed-sheet writer (v0.7.4).
 *
 * Producing an imposed PDF for a large job used to be a memory bomb: every
 * rendered card (several MB of canvas each) was collected for the whole run,
 * the PDF document then held every embedded JPEG, and `save()` made a second
 * full copy of it. A 600-record, double-sided job could reach multiple
 * gigabytes and crash the tab.
 *
 * This writer removes all three spikes:
 * - a card is encoded to a CMYK JPEG the moment its sheet page is complete and
 *   its canvas is released immediately, so only ONE page of canvases exists at
 *   any time;
 * - the PDF document is bounded by a byte budget: once a part holds its
 *   budget of card images it is serialised, turned into a Blob (which the
 *   browser can page out) and dropped, and a fresh document continues the job
 *   with continuous sheet/card numbering;
 * - back faces (separate arrangement) are buffered as compressed bytes only
 *   for the current part, never for the whole job.
 *
 * Small and medium jobs still produce a single PDF; only jobs that would
 * otherwise hold an oversized document are split into numbered parts.
 */
import {
  createImposedPdfBuilder,
  encodeCardForSheet,
  releaseCanvas,
  type EncodedCard,
  type ImposedPdfBuilder,
  type SheetCardSource,
} from './impositionService';
import type { ImpositionSettings, SheetLayout } from './impositionTypes';

// `SheetLayout` is part of the public options shape below (kept as an import).

/**
 * Card-image budget per PDF part (bytes). 96 MB of embedded CMYK JPEGs keeps
 * the document plus its serialised copy comfortably inside a browser tab while
 * still fitting a few hundred double-sided cards in one file.
 */
export const DEFAULT_PART_BUDGET_BYTES = 96 * 1024 * 1024;

/** One finished download of a streamed sheet job */
export interface SheetPart {
  blob: Blob;
  fileName: string;
}

/** Options for {@link SheetJobWriter} */
export interface SheetJobWriterOptions {
  /** Imposition settings (paper, bleed, gap, marks, numbering) */
  settings: ImpositionSettings;
  /** Layout computed for the SAME exact card size passed below */
  layout: SheetLayout;
  /** Exact artwork trim size in points — cards are placed 1:1 */
  cardSizePt: { width: number; height: number };
  /** Design DPI written into the PDF options */
  dpi?: number;
  /** JPEG quality for embedded card images */
  quality?: number;
  /** Physical sheets the whole job will produce (progress reporting) */
  totalSheets: number;
  /** True when back faces are written into this document (separate sheets) */
  hasBackFaces?: boolean;
  /** Card-image budget per part (default {@link DEFAULT_PART_BUDGET_BYTES}) */
  partBudgetBytes?: number;
  /** Base PDF name without extension (default "sheet") */
  baseName?: string;
  /** Called after each page is written (1-based sheets so far, total) */
  onSheetWritten?: (written: number, total: number) => void;
}

/**
 * Streaming imposed-PDF writer with bounded memory.
 *
 * Callers place cards into the current page (`put` / `putNext`), flush when the
 * page is complete, and finally `finish()` to get one PDF — or, for oversized
 * jobs, several numbered PDFs.
 */
export class SheetJobWriter {
  private readonly settings: ImpositionSettings;
  private readonly options: SheetJobWriterOptions;
  private readonly perSheet: number;
  private readonly columns: number;
  private readonly partBudget: number;
  /** Budget applied while fronts are being written (halved when backs follow) */
  private readonly frontBudget: number;
  /** True while a part is being closed (blocks recursive rotation) */
  private closing = false;

  private builder: ImposedPdfBuilder | null = null;
  private buffer: SheetCardSource[];
  /** Printed card number per slot, parallel to `buffer` */
  private numbers: Array<number | null>;
  private nextSlot = 0;
  /** Back faces queued for the end of the current part (compressed bytes) */
  private pendingBacks: Array<{ card: EncodedCard; cardNumber: number | null }> = [];
  private backPage: Array<SheetCardSource> = [];
  private backNumbers: Array<number | null> = [];
  private backPlaced = 0;

  /** Pages written into the CURRENT document */
  private pagesInPart = 0;
  /** Pages written into finished parts */
  private pagesFinished = 0;
  /** Embedded image bytes in the current document */
  private bytesInPart = 0;
  private readonly parts: SheetPart[] = [];

  private constructor(options: SheetJobWriterOptions) {
    this.options = options;
    this.settings = options.settings;
    this.perSheet = options.layout.perSheet;
    this.columns = Math.max(1, options.layout.columns);
    this.partBudget = Math.max(8 * 1024 * 1024, options.partBudgetBytes ?? DEFAULT_PART_BUDGET_BYTES);
    // Separate-sheets jobs append the back faces of the same records to the
    // document, so fronts get half of the budget and the part stays bounded.
    this.frontBudget = options.hasBackFaces ? this.partBudget / 2 : this.partBudget;
    this.buffer = new Array(this.perSheet).fill(null);
    this.numbers = this.emptyNumbers();
    this.backPage = new Array(this.perSheet).fill(null);
    this.backNumbers = this.emptyNumbers();
  }

  /** A slot-aligned list of "no number" entries */
  private emptyNumbers(): Array<number | null> {
    return new Array(this.perSheet).fill(null);
  }

  /**
   * Create a writer and prepare its first PDF document.
   *
   * @param options - Settings, exact card size and progress reporting
   * @returns Ready writer
   */
  static async create(options: SheetJobWriterOptions): Promise<SheetJobWriter> {
    const writer = new SheetJobWriter(options);
    writer.builder = await writer.newBuilder();
    return writer;
  }

  /** Sheets (pages) written across all finished parts plus the current one */
  get sheetCount(): number {
    return this.pagesFinished + this.pagesInPart;
  }

  /** Parts finished so far (empty while the first is being built) */
  get partCount(): number {
    return this.parts.length + 1;
  }

  /**
   * Place a card at an explicit slot in the current page.
   *
   * @param slot - Row-major slot index
   * @param card - Card source
   * @param cardNumber - Number printed on the card (record-based; a record's
   *                     front and back receive the same value)
   */
  put(slot: number, card: SheetCardSource, cardNumber: number | null = null): void {
    if (slot < 0 || slot >= this.buffer.length) return;
    this.buffer[slot] = card;
    this.numbers[slot] = cardNumber;
  }

  /**
   * Place a card in the next free slot (row-major fill).
   *
   * @param card - Card source
   * @param cardNumber - Number printed on the card
   */
  putNext(card: SheetCardSource, cardNumber: number | null = null): void {
    if (this.nextSlot >= this.buffer.length) return;
    this.buffer[this.nextSlot] = card;
    this.numbers[this.nextSlot] = cardNumber;
    this.nextSlot += 1;
  }

  /** True when every slot on the current page is filled */
  get isFull(): boolean {
    return this.buffer.every((entry) => entry !== null);
  }

  /**
   * Queue a back face for the end of the current part. Only the compressed
   * bytes are kept, so the memory cost is a JPEG per card, not a canvas.
   *
   * @param card - Encoded back card, in record order
   * @param cardNumber - Number printed on the back (same as its front)
   */
  putBack(card: EncodedCard, cardNumber: number | null = null): void {
    this.pendingBacks.push({ card, cardNumber });
  }

  /** Encode the current page, append it, and free its canvases */
  async flushPage(): Promise<void> {
    if (this.buffer.every((entry) => entry === null)) {
      this.buffer = new Array(this.perSheet).fill(null);
      this.numbers = this.emptyNumbers();
      this.nextSlot = 0;
      return;
    }
    const page = this.buffer;
    const numbers = this.numbers;
    this.buffer = new Array(this.perSheet).fill(null);
    this.numbers = this.emptyNumbers();
    this.nextSlot = 0;
    await this.writePage(page, numbers);
  }

  /**
   * Finish the job.
   *
   * @returns One PDF part, or several numbered parts for oversized jobs
   */
  async finish(): Promise<SheetPart[]> {
    await this.flushPage();
    if (this.sheetCount === 0) {
      // Nothing was ever placed (every record failed, or all rows were
      // skipped): drop the empty document instead of handing the caller a
      // blank PDF with zero pages.
      this.builder = null;
      return [];
    }
    if (this.builder) await this.endPart();
    const base = this.options.baseName ?? 'sheet';
    if (this.parts.length <= 1) {
      const single = this.parts[0];
      return single ? [{ blob: single.blob, fileName: `${base}.pdf` }] : [];
    }
    return this.parts.map((part, index) => ({
      blob: part.blob,
      fileName: `${base}_part${index + 1}of${this.parts.length}.pdf`,
    }));
  }

  /** Create a PDF document for the next part of the job */
  private async newBuilder(): Promise<ImposedPdfBuilder> {
    const builder = await createImposedPdfBuilder(this.settings, {
      dpi: this.options.dpi,
      cardSizePt: this.options.cardSizePt,
      quality: this.options.quality,
    });
    this.pagesInPart = 0;
    this.bytesInPart = 0;
    return builder;
  }

  /** Encode one page's canvases, append it, then release the canvases */
  private async writePage(
    page: SheetCardSource[],
    numbers: Array<number | null> = []
  ): Promise<void> {
    const builder = this.builder;
    if (!builder) return;
    const encoded: SheetCardSource[] = new Array(page.length);
    try {
      for (let index = 0; index < page.length; index += 1) {
        const entry = page[index] ?? null;
        if (entry === null) {
          encoded[index] = null;
        } else if ('bytes' in entry) {
          this.bytesInPart += entry.bytes.length;
          encoded[index] = entry;
        } else {
          const card = await encodeCardForSheet(entry, this.options.quality);
          this.bytesInPart += card.bytes.length;
          encoded[index] = card;
          // The canvas is no longer needed — this is the whole point of
          // streaming: a sheet's pixels never outlive its page.
          releaseCanvas(entry);
        }
      }
      await builder.addSheet(encoded, numbers);
      this.pagesInPart += 1;
      this.options.onSheetWritten?.(this.sheetCount, this.options.totalSheets);
    } finally {
      // Covered slots may still hold canvases if encoding failed midway.
      for (const entry of page) {
        if (entry && !('bytes' in entry)) releaseCanvas(entry);
      }
      // If the budget is exhausted, close this part only with a complete page
      // (never between a sheet's cards).
      if (!this.closing && this.bytesInPart >= this.frontBudget) await this.endPart();
    }
  }

  /** Serialise the current part, write any queued back pages, and rotate */
  private async endPart(): Promise<void> {
    const builder = this.builder;
    if (!builder || this.closing) return;
    this.closing = true;
    try {
      // Back pages belong to the same records, so they close with this part.
      // `closing` stops a back page from rotating the document recursively.
      await this.flushBacks();
    } finally {
      this.closing = false;
    }
    this.builder = null;
    this.pagesFinished += this.pagesInPart;
    this.pagesInPart = 0;
    this.bytesInPart = 0;
    const bytes = await builder.finish();
    this.parts.push({
      blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
      fileName: '',
    });
    if (this.options.totalSheets > this.sheetCount) {
      this.builder = await this.newBuilder();
    }
  }

  /** Write the queued back faces of the current part (mirrored when duplex) */
  private async flushBacks(): Promise<void> {
    if (this.pendingBacks.length === 0 && this.backPlaced === 0) return;
    const queued = this.pendingBacks;
    this.pendingBacks = [];
    for (const { card, cardNumber } of queued) {
      // Index WITHIN the current back page (never across pages).
      const index = this.backPlaced % this.perSheet;
      const row = Math.floor(index / this.columns);
      const column = index % this.columns;
      const slot = this.settings.duplex ? row * this.columns + (this.columns - 1 - column) : index;
      this.backPage[slot] = card;
      // The number travels with the record, so a mirrored back still prints
      // the same number as its front.
      this.backNumbers[slot] = cardNumber;
      this.backPlaced += 1;
      if (this.backPlaced % this.perSheet === 0) {
        const page = this.backPage;
        const numbers = this.backNumbers;
        this.backPage = new Array(this.perSheet).fill(null);
        this.backNumbers = this.emptyNumbers();
        await this.writePage(page, numbers);
      }
    }
    if (this.backPlaced % this.perSheet > 0) {
      const page = this.backPage;
      const numbers = this.backNumbers;
      this.backPage = new Array(this.perSheet).fill(null);
      this.backNumbers = this.emptyNumbers();
      await this.writePage(page, numbers);
    }
    this.backPlaced = 0;
  }
}
