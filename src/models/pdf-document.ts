/**
 * Thin wrapper around a pdf.js document: loading, page geometry, outline,
 * page labels, link destinations and cached text extraction.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pageTextFromPdfItems, type PageText, type PdfTextItem } from '../lib/page-text.ts';
import type { PageSize } from './types.ts';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Runtime assets copied next to the app by vite.config.ts. */
const ASSETS = new URL('vendor/pdfjs/', document.baseURI).href;
const PAGE_SIZE_BATCH = 64;

export { pdfjs };

export interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineItem[];
}

export interface Destination {
  page: number;
  x: number | null;
  y: number | null;
}

type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export class PdfDocument {
  readonly proxy: PDFDocumentProxy;
  readonly numPages: number;
  readonly #loadingTask: { destroy(): Promise<void> };
  /** Unscaled page sizes (rotation applied); index = page − 1. */
  pageSizes: PageSize[] = [];
  outline: OutlineItem[] = [];
  pageLabels: string[] | null = null;
  readonly #text = new Map<number, Promise<{ text: PageText; content: TextContent }>>();

  private constructor(proxy: PDFDocumentProxy, loadingTask: { destroy(): Promise<void> }) {
    this.proxy = proxy;
    this.#loadingTask = loadingTask;
    this.numPages = proxy.numPages;
  }

  static async load(bytes: Uint8Array): Promise<PdfDocument> {
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
      isEvalSupported: false,
    } as Parameters<typeof pdfjs.getDocument>[0]);
    const doc = new PdfDocument(await loadingTask.promise, loadingTask);
    await Promise.all([doc.#loadPageSizes(), doc.#loadNavigation()]);
    return doc;
  }

  // Every page's size is needed up front to lay out continuous scrolling.
  async #loadPageSizes(): Promise<void> {
    const sizes: PageSize[] = new Array(this.numPages);
    for (let start = 0; start < this.numPages; start += PAGE_SIZE_BATCH) {
      const batch: Promise<void>[] = [];
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

  async #loadNavigation(): Promise<void> {
    this.outline = ((await this.proxy.getOutline().catch(() => null)) as OutlineItem[] | null) ?? [];
    this.pageLabels = await this.proxy.getPageLabels().catch(() => null);
  }

  getPage(n: number): Promise<PDFPageProxy> {
    return this.proxy.getPage(n);
  }

  /** Printed page label ("xii", "42") when the PDF defines one, else the number. */
  pageLabel(n: number): string {
    return this.pageLabels?.[n - 1] || String(n);
  }

  /** Resolves a named or explicit destination to a page and optional point. */
  async resolveDestination(dest: string | unknown[] | null): Promise<Destination | null> {
    const explicit = typeof dest === 'string' ? await this.proxy.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref, kind] = explicit as [unknown, { name?: string } | undefined, ...number[]];
    let pageIndex: number;
    if (ref && typeof ref === 'object') pageIndex = await this.proxy.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
    else if (Number.isInteger(ref)) pageIndex = ref as number;
    else return null;

    const arg = (i: number) => (typeof explicit[i] === 'number' ? (explicit[i] as number) : null);
    // Layouts per PDF 32000-1 §12.3.2.2.
    switch (kind?.name) {
      case 'XYZ':
        return { page: pageIndex + 1, x: arg(2), y: arg(3) };
      case 'FitH':
      case 'FitBH':
        return { page: pageIndex + 1, x: null, y: arg(2) };
      case 'FitR':
        return { page: pageIndex + 1, x: arg(2), y: arg(5) };
      default:
        return { page: pageIndex + 1, x: null, y: null };
    }
  }

  /** Native text of page `n`, plus the raw pdf.js content for the text layer. */
  getText(n: number): Promise<{ text: PageText; content: TextContent }> {
    if (!this.#text.has(n)) {
      const promise = this.getPage(n)
        .then((page) => page.getTextContent())
        .then((content) => ({ text: pageTextFromPdfItems(content.items as PdfTextItem[]), content }));
      this.#text.set(n, promise);
    }
    return this.#text.get(n)!;
  }

  /** Title of the last outline section starting on or before `page` (used to name bookmarks). */
  async sectionTitleFor(page: number): Promise<string | null> {
    let best: { page: number; title: string } | null = null;
    const visit = async (items: OutlineItem[]) => {
      for (const item of items) {
        if (item.dest) {
          const target = await this.resolveDestination(item.dest).catch(() => null);
          if (target && target.page <= page && (!best || target.page >= best.page)) best = { page: target.page, title: item.title };
        }
        if (item.items?.length) await visit(item.items);
      }
    };
    await visit(this.outline);
    return (best as { title: string } | null)?.title ?? null;
  }

  destroy(): void {
    void this.#loadingTask.destroy();
  }
}
