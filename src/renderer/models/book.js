/**
 * A Book is an open PDF plus everything the reader keeps about it, persisted
 * as the unified JSON record (see docs/ARCHITECTURE.md → "Storage schema").
 *
 * Composition:
 *   doc          PdfDocument      — rendering & text (pdf.js)
 *   annotations  AnnotationStore  — highlights, notes, drawings (+ undo)
 *   bookmarks    BookmarkStore
 *   history      NavigationHistory — browser-style back/forward
 *   session      BookRecord.sessionState — last page, zoom, mode, theme…
 *   ocr          page → OcrPage    — cached OCR results (separate file)
 *   crop         {odd, even}       — cached margin-crop boxes (separate file)
 *
 * Any change to the stores schedules a debounced save.
 *
 * @typedef {object} SessionState
 * @property {number} lastPage
 * @property {number|null} zoomLevel
 * @property {'auto'|'fit-page'|'fit-width'|'custom'} zoomMode
 * @property {'continuous'|'single'|'two-page'} viewMode
 * @property {string|null} theme
 * @property {boolean} isMarginCropped
 * @property {import('../lib/history.js').HistoryEntry[]} navigationStack
 * @property {number} stackPointer
 *
 * @typedef {object} BookRecord
 * @property {string} bookId
 * @property {string} fileName
 * @property {string} filePath
 * @property {number} pageCount
 * @property {string} lastSaved
 * @property {SessionState} sessionState
 * @property {import('./annotation-store.js').Annotation[]} annotations
 * @property {import('./bookmark-store.js').Bookmark[]} bookmarks
 */
import { PdfDocument } from './pdf-document.js';
import { AnnotationStore } from './annotation-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { NavigationHistory } from '../lib/history.js';
import { pageTextFromOcr } from '../lib/page-text.js';
import { Emitter, debounce, nowIso } from '../lib/util.js';

const SAVE_DELAY_MS = 600;

/** @returns {SessionState} */
const defaultSession = () => ({
  lastPage: 1,
  zoomLevel: null,
  zoomMode: 'auto',
  viewMode: 'continuous',
  theme: null,
  isMarginCropped: false,
  navigationStack: [],
  stackPointer: -1,
});

export class Book extends Emitter {
  /**
   * Reads, hashes and parses the file, then loads its saved record.
   * @param {string} path
   */
  static async open(path) {
    const file = await window.api.readFile(path);
    const doc = await PdfDocument.load(file.data);
    const [record, ocr, crop] = await Promise.all([
      window.api.loadBook(file.bookId),
      window.api.loadExtra(file.bookId, 'ocr'),
      window.api.loadExtra(file.bookId, 'crop'),
    ]);
    return new Book({ file, doc, record, ocr, crop });
  }

  constructor({ file, doc, record, ocr, crop }) {
    super();
    this.id = file.bookId;
    this.filePath = file.path;
    this.fileName = file.name;
    this.doc = doc;
    this.isFirstOpen = !record;

    /** @type {BookRecord} */
    this.record = {
      bookId: file.bookId,
      annotations: [],
      bookmarks: [],
      ...record,
      fileName: file.name,
      filePath: file.path,
      pageCount: doc.numPages,
      sessionState: { ...defaultSession(), ...record?.sessionState },
    };
    this.ocr = ocr ?? {};
    this.crop = crop ?? null;

    this.annotations = new AnnotationStore(this.record.annotations);
    this.bookmarks = new BookmarkStore(this.record.bookmarks);
    this.history = new NavigationHistory({ stack: this.session.navigationStack, pointer: this.session.stackPointer });

    this.save = debounce(() => this.#write(), SAVE_DELAY_MS);
    this.annotations.on('change', () => this.save());
    this.bookmarks.on('change', () => this.save());
  }

  get numPages() {
    return this.doc.numPages;
  }

  get session() {
    return this.record.sessionState;
  }

  /** Size of page `n` at 100% zoom, in CSS px. */
  pageSize(n) {
    return this.doc.pageSizes[n - 1];
  }

  pageLabel(n) {
    return this.doc.pageLabel(n);
  }

  // ---- Navigation history ------------------------------------------------

  recordJump(from, to) {
    this.history.push(from, to);
    this.#syncHistory();
  }

  /** @returns {import('../lib/history.js').HistoryEntry|null} */
  stepHistory(current, delta) {
    const entry = this.history.step(current, delta);
    if (entry) this.#syncHistory();
    return entry;
  }

  #syncHistory() {
    Object.assign(this.session, this.history.toJSON());
    this.emit('history');
    this.save();
  }

  // ---- Text --------------------------------------------------------------

  hasOcr(page) {
    return Boolean(this.ocr[page]?.lines?.length);
  }

  /**
   * Text used for search and reflow: the PDF's own text when it has any,
   * otherwise OCR output for scanned pages.
   * @returns {Promise<import('../lib/page-text.js').PageText>}
   */
  async readableText(page) {
    const { text } = await this.doc.getText(page);
    if (text.hasText || !this.hasOcr(page)) return text;
    return pageTextFromOcr(this.ocr[page]);
  }

  /** True when the first few pages have no extractable text (likely a scan). */
  async looksScanned() {
    const sample = Math.min(5, this.numPages);
    for (let p = 1; p <= sample; p++) {
      if ((await this.doc.getText(p)).text.hasText || this.hasOcr(p)) return false;
    }
    return true;
  }

  setOcr(page, result) {
    this.ocr[page] = result;
    this.emit('ocr', page);
  }

  saveOcr() {
    return window.api.saveExtra(this.id, 'ocr', this.ocr);
  }

  setCrop(crop) {
    this.crop = crop;
    return window.api.saveExtra(this.id, 'crop', crop);
  }

  // ---- Persistence -------------------------------------------------------

  async #write() {
    this.record.lastSaved = nowIso();
    await window.api.saveBook(this.id, this.record);
  }

  /** Saves immediately and releases the pdf.js document. */
  async close() {
    await this.save.flush();
    this.doc.destroy();
  }
}
