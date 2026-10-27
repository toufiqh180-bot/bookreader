/**
 * A Book is an open PDF plus everything the reader keeps about it, persisted
 * as the unified book record through the platform.
 *
 *   doc          PdfDocument        rendering & text (pdf.js)
 *   annotations  AnnotationStore    highlights, notes, drawings (+ undo)
 *   bookmarks    BookmarkStore
 *   history      NavigationHistory  browser-style back/forward
 *   session      SessionState       last page, zoom, layout, theme…
 *   ocr          page → OcrPage     cached OCR results
 *   crop         CropBoxes          cached margin-crop boxes
 *
 * Changes to the stores schedule a debounced save.
 */
import { PdfDocument } from './pdf-document.ts';
import { AnnotationStore } from './annotation-store.ts';
import { BookmarkStore } from './bookmark-store.ts';
import { NavigationHistory } from '../lib/history.ts';
import { pageTextFromOcr, type PageText } from '../lib/page-text.ts';
import { Emitter, debounce, nowIso, type Debounced } from '../lib/util.ts';
import { contentId } from '../services/content-id.ts';
import type { BookSource, Platform } from '../platform/platform.ts';
import type { BookRecord, CropBoxes, HistoryEntry, OcrPage, PageSize, Position, SessionState } from './types.ts';

const SAVE_DELAY_MS = 600;

const defaultSession = (): SessionState => ({
  lastPage: 1,
  zoomLevel: null,
  zoomMode: 'auto',
  viewMode: 'continuous',
  theme: null,
  isMarginCropped: false,
  splitSpreads: null,
  navigationStack: [],
  stackPointer: -1,
});

interface BookEvents extends Record<string, unknown[]> {
  history: [];
  ocr: [page: number];
  session: [];
}

export class Book extends Emitter<BookEvents> {
  readonly id: string;
  readonly fileName: string;
  readonly filePath?: string;
  readonly doc: PdfDocument;
  readonly record: BookRecord;
  readonly annotations: AnnotationStore;
  readonly bookmarks: BookmarkStore;
  readonly history: NavigationHistory;
  /** True the first time this book is opened on this device. */
  readonly isFirstOpen: boolean;
  ocr: Record<number, OcrPage>;
  crop: CropBoxes | null;
  readonly save: Debounced<[]>;
  /** Where the book was opened from, so exports can re-read the original bytes. */
  readonly source: BookSource;
  readonly #platform: Platform;

  /** Reads, identifies and parses a PDF, then loads its saved record. */
  static async open(source: BookSource, platform: Platform): Promise<Book> {
    const file = await platform.readBook(source);
    const id = await contentId(file.bytes);
    // pdf.js transfers the buffer to its worker, so hand it a copy.
    const doc = await PdfDocument.load(file.bytes.slice());
    const [record, ocr, crop] = await Promise.all([
      platform.loadRecord(id),
      platform.loadExtra<Record<number, OcrPage>>(id, 'ocr'),
      platform.loadExtra<CropBoxes>(id, 'crop'),
    ]);
    await platform.rememberBook(id, file);
    return new Book({ id, name: file.name, path: file.path, doc, record, ocr, crop, platform, source });
  }

  private constructor(init: {
    id: string;
    name: string;
    path?: string;
    doc: PdfDocument;
    record: BookRecord | null;
    ocr: Record<number, OcrPage> | null;
    crop: CropBoxes | null;
    platform: Platform;
    source: BookSource;
  }) {
    super();
    this.id = init.id;
    this.fileName = init.name;
    this.filePath = init.path;
    this.doc = init.doc;
    this.#platform = init.platform;
    this.source = init.source;
    this.isFirstOpen = !init.record;
    this.record = {
      bookId: init.id,
      annotations: [],
      bookmarks: [],
      lastSaved: nowIso(),
      ...init.record,
      fileName: init.name,
      filePath: init.path,
      pageCount: init.doc.numPages,
      sessionState: { ...defaultSession(), ...init.record?.sessionState },
    };
    this.ocr = init.ocr ?? {};
    this.crop = init.crop;
    this.annotations = new AnnotationStore(this.record.annotations);
    this.bookmarks = new BookmarkStore(this.record.bookmarks);
    this.history = new NavigationHistory({ stack: this.session.navigationStack, pointer: this.session.stackPointer });

    this.save = debounce(() => this.#write(), SAVE_DELAY_MS);
    this.annotations.on('change', () => this.save());
    this.bookmarks.on('change', () => this.save());
  }

  get numPages(): number {
    return this.doc.numPages;
  }

  get session(): SessionState {
    return this.record.sessionState;
  }

  get pageSizes(): PageSize[] {
    return this.doc.pageSizes;
  }

  pageSize(n: number): PageSize {
    return this.doc.pageSizes[n - 1];
  }

  pageLabel(n: number): string {
    return this.doc.pageLabel(n);
  }

  /** Updates session fields and saves. */
  updateSession(patch: Partial<SessionState>): void {
    Object.assign(this.session, patch);
    this.emit('session');
    this.save();
  }

  // ---- Navigation history ------------------------------------------------

  recordJump(from: Position, to: Position): void {
    this.history.push(from, to);
    this.#syncHistory();
  }

  stepHistory(current: Position, delta: number): HistoryEntry | null {
    const entry = this.history.step(current, delta);
    if (entry) this.#syncHistory();
    return entry;
  }

  #syncHistory(): void {
    Object.assign(this.session, this.history.toJSON());
    this.emit('history');
    this.save();
  }

  // ---- Text --------------------------------------------------------------

  hasOcr(page: number): boolean {
    return Boolean(this.ocr[page]?.lines?.length);
  }

  /** Text for search and reflow: the PDF's own text, or OCR text for scanned pages. */
  async readableText(page: number): Promise<PageText> {
    const { text } = await this.doc.getText(page);
    if (text.hasText || !this.hasOcr(page)) return text;
    return pageTextFromOcr(this.ocr[page]);
  }

  /** True when the first few pages have no extractable text (likely a scan). */
  async looksScanned(): Promise<boolean> {
    for (let p = 1; p <= Math.min(5, this.numPages); p++) {
      if ((await this.doc.getText(p)).text.hasText || this.hasOcr(p)) return false;
    }
    return true;
  }

  setOcr(page: number, result: OcrPage): void {
    this.ocr[page] = result;
    this.emit('ocr', page);
  }

  saveOcr(): Promise<void> {
    return this.#platform.saveExtra(this.id, 'ocr', this.ocr);
  }

  setCrop(crop: CropBoxes): Promise<void> {
    this.crop = crop;
    return this.#platform.saveExtra(this.id, 'crop', crop);
  }

  /** The untouched original file (pdf.js keeps only a parsed copy). */
  async readOriginal(): Promise<Uint8Array> {
    return (await this.#platform.readBook(this.source)).bytes;
  }

  // ---- Persistence -------------------------------------------------------

  async #write(): Promise<void> {
    this.record.lastSaved = nowIso();
    await this.#platform.saveRecord(this.id, this.record);
  }

  /** Saves immediately and releases the pdf.js document. */
  async close(): Promise<void> {
    await this.save.flush();
    this.doc.destroy();
  }
}
