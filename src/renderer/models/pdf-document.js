/**
 * Thin wrapper around a pdf.js document: loading, page geometry, outline,
 * page labels, link destinations and cached text extraction.
 */
import * as pdfjs from '../../../node_modules/pdfjs-dist/build/pdf.mjs';
import { pageTextFromPdfItems } from '../lib/page-text.js';

const PDFJS_ROOT = 'app://bundle/node_modules/pdfjs-dist/';
pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_ROOT}build/pdf.worker.mjs`;

export { pdfjs };

const PAGE_SIZE_BATCH = 64;

export class PdfDocument {
  /** @param {import('pdfjs-dist').PDFDocumentProxy} proxy */
  constructor(proxy) {
    this.proxy = proxy;
    this.numPages = proxy.numPages;
    /** Unscaled page sizes in CSS px at 100% (rotation applied); index = page − 1. */
    this.pageSizes = [];
    this.outline = [];
    this.pageLabels = null;
    /** @type {Map<number, Promise<{ text: import('../lib/page-text.js').PageText, content: object }>>} */
    this.textCache = new Map();
  }

  /** @param {Uint8Array} bytes */
  static async load(bytes) {
    const proxy = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${PDFJS_ROOT}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ROOT}standard_fonts/`,
      wasmUrl: `${PDFJS_ROOT}wasm/`,
      iccUrl: `${PDFJS_ROOT}iccs/`,
      isEvalSupported: false,
    }).promise;
    const doc = new PdfDocument(proxy);
    await Promise.all([doc.#loadPageSizes(), doc.#loadNavigation()]);
    return doc;
  }

  // Every page's size is needed up front to lay out continuous scrolling.
  async #loadPageSizes() {
    const sizes = new Array(this.numPages);
    for (let start = 0; start < this.numPages; start += PAGE_SIZE_BATCH) {
      const batch = [];
      for (let i = start; i < Math.min(start + PAGE_SIZE_BATCH, this.numPages); i++) {
        batch.push(
          this.proxy.getPage(i + 1).then((page) => {
            const { width, height } = page.getViewport({ scale: 1 });
            sizes[i] = { w: width, h: height };
          }),
        );
      }
      await Promise.all(batch);
    }
    this.pageSizes = sizes;
  }

  async #loadNavigation() {
    this.outline = (await this.proxy.getOutline().catch(() => null)) ?? [];
    this.pageLabels = await this.proxy.getPageLabels().catch(() => null);
  }

  getPage(n) {
    return this.proxy.getPage(n);
  }

  /** Printed page label ("xii", "42") when the PDF defines one, else the number. */
  pageLabel(n) {
    return this.pageLabels?.[n - 1] || String(n);
  }

  /**
   * Resolves a named or explicit destination to a page and (optional) point.
   * @returns {Promise<{ page: number, x: number|null, y: number|null } | null>}
   */
  async resolveDestination(dest) {
    const explicit = typeof dest === 'string' ? await this.proxy.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref, kind] = explicit;
    let pageIndex;
    if (ref && typeof ref === 'object') pageIndex = await this.proxy.getPageIndex(ref);
    else if (Number.isInteger(ref)) pageIndex = ref;
    else return null;

    // See PDF 32000-1 §12.3.2.2 for the destination array layouts.
    switch (kind?.name) {
      case 'XYZ':
        return { page: pageIndex + 1, x: explicit[2], y: explicit[3] };
      case 'FitH':
      case 'FitBH':
        return { page: pageIndex + 1, x: null, y: explicit[2] };
      case 'FitR':
        return { page: pageIndex + 1, x: explicit[2], y: explicit[5] };
      default:
        return { page: pageIndex + 1, x: null, y: null };
    }
  }

  /** Native text of page `n` plus the raw pdf.js content (for the text layer). */
  getText(n) {
    if (!this.textCache.has(n)) {
      const promise = this.getPage(n)
        .then((page) => page.getTextContent())
        .then((content) => ({ text: pageTextFromPdfItems(content.items), content }));
      this.textCache.set(n, promise);
    }
    return this.textCache.get(n);
  }

  /**
   * Walks the outline and returns the title of the last section starting on
   * or before `page` — used to name bookmarks ("Chapter 2: Meaningful Names").
   */
  async sectionTitleFor(page) {
    let best = null;
    const visit = async (items) => {
      for (const item of items) {
        if (item.dest) {
          const target = await this.resolveDestination(item.dest).catch(() => null);
          if (target && target.page <= page && (!best || target.page >= best.page)) best = { page: target.page, title: item.title };
        }
        if (item.items?.length) await visit(item.items);
      }
    };
    await visit(this.outline);
    return best?.title ?? null;
  }

  destroy() {
    this.proxy.destroy();
  }
}
