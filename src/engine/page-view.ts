/**
 * One page slot on screen (a whole PDF page, or one half of a two-page scan),
 * built from stacked layers:
 *
 *   .page                 visible box (sized to the slot, after any crop)
 *   └ .page-inner         the full PDF page, shifted to hide what's cropped
 *       ├ .canvas-wrap    pdf.js raster — the only layer redrawn on zoom
 *       ├ .tint           theme tint (multiply blend)
 *       ├ .textLayer      transparent, selectable text (native or OCR)
 *       ├ .link-layer     clickable PDF links
 *       └ svg.annot-layer annotations, drawn in PDF user space
 *
 * Everything except the canvas is built once in scale-independent units (CSS
 * variables, percentages, a scale-1 SVG viewBox), so zooming only re-rasters.
 */
import type { PageViewport, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { pdfjs } from '../models/pdf-document.ts';
import type { Book } from '../models/book.ts';
import type { CropBox, PdfRect } from '../models/types.ts';
import type { PageSlot } from '../lib/page-slots.ts';
import { el, svgEl } from './dom.ts';

const MAX_CANVAS_PIXELS = 24e6;
const FULL_PAGE: CropBox = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

/** What a PageView needs from the pane that owns it. */
export interface PageHost {
  /** Margin-crop box for a PDF page, or null when cropping is off. */
  marginCrop(pageNumber: number): CropBox | null;
  followDestination(dest: string | unknown[]): void;
  openExternal(url: string): void;
  linksEnabled(): boolean;
  drawOverlay(view: PageView): void;
  isNearViewport(view: PageView): boolean;
}

/** Lets event handlers find the PageView behind a DOM node. */
export interface PageElement extends HTMLDivElement {
  pageView?: PageView;
}

export class PageView {
  readonly book: Book;
  readonly slot: PageSlot;
  readonly host: PageHost;
  readonly el: PageElement;
  readonly inner: HTMLDivElement;
  readonly canvasWrap: HTMLDivElement;
  readonly textLayer: HTMLDivElement;
  readonly linkLayer: HTMLDivElement;
  readonly overlay: SVGSVGElement;
  /** Annotation renderers draw here, in PDF user space. */
  readonly overlayGroup: SVGGElement;
  scale = 1;
  layersBuilt = false;
  baseViewport: PageViewport | null = null;
  #rasterScale = 0;
  #busy = false;
  #pdfPage: PDFPageProxy | null = null;
  #renderTask: RenderTask | null = null;
  static #measure: CanvasRenderingContext2D | null = null;

  constructor(book: Book, slot: PageSlot, host: PageHost) {
    this.book = book;
    this.slot = slot;
    this.host = host;
    this.canvasWrap = el('div', { class: 'canvas-wrap' });
    this.textLayer = el('div', { class: 'textLayer' });
    this.linkLayer = el('div', { class: 'link-layer' });
    this.overlay = svgEl('svg', { class: 'annot-layer', preserveAspectRatio: 'none' });
    this.overlayGroup = svgEl('g');
    this.overlay.append(this.overlayGroup);
    this.inner = el('div', { class: 'page-inner' }, [this.canvasWrap, el('div', { class: 'tint' }), this.textLayer, this.linkLayer, this.overlay]);
    this.el = el('div', { class: 'page', dataset: { page: String(slot.pageNumber), slot: String(slot.index) } }, [this.inner]) as PageElement;
    this.el.pageView = this;
  }

  get pageNumber(): number {
    return this.slot.pageNumber;
  }

  /** Visible part of the PDF page as fractions: the slot's half, then any margin crop. */
  get crop(): CropBox {
    const margin = this.host.marginCrop(this.pageNumber);
    const { x0, x1 } = this.slot;
    if (x1 - x0 < 1) {
      // Half of a two-page scan: margin crop (measured on whole spreads) only trims top/bottom.
      return { x: x0, w: x1 - x0, y: margin?.y ?? 0, h: margin?.h ?? 1 };
    }
    return margin ?? FULL_PAGE;
  }

  /** Size of the visible box at `scale`, in CSS px. */
  displaySize(scale = this.scale): { w: number; h: number } {
    const { w, h } = this.book.pageSize(this.pageNumber);
    const crop = this.crop;
    return { w: w * crop.w * scale, h: h * crop.h * scale };
  }

  get needsRender(): boolean {
    return !this.layersBuilt || Math.abs(this.#rasterScale - this.scale) > 1e-3;
  }

  /** Resizes the boxes immediately; the canvas catches up on the next render(). */
  setScale(scale: number): void {
    this.scale = scale;
    const { w, h } = this.book.pageSize(this.pageNumber);
    const crop = this.crop;
    const display = this.displaySize();
    Object.assign(this.el.style, { width: `${display.w}px`, height: `${display.h}px` });
    Object.assign(this.inner.style, {
      width: `${w * scale}px`,
      height: `${h * scale}px`,
      transform: `translate(${-crop.x * w * scale}px, ${-crop.y * h * scale}px)`,
    });
    // pdf.js text-layer sizing reads these.
    this.el.style.setProperty('--scale-factor', String(scale));
    this.el.style.setProperty('--total-scale-factor', String(scale));
    this.el.style.setProperty('--user-unit', '1');
  }

  async render(): Promise<void> {
    if (this.#busy || !this.needsRender) return;
    this.#busy = true;
    const scale = this.scale;
    try {
      this.#pdfPage ??= await this.book.doc.getPage(this.pageNumber);
      this.baseViewport ??= this.#pdfPage.getViewport({ scale: 1 });
      if (Math.abs(this.#rasterScale - scale) > 1e-3) await this.#raster(scale);
      if (!this.layersBuilt) {
        this.layersBuilt = true;
        await Promise.all([this.buildTextLayer(), this.#buildLinkLayer()]);
        this.drawOverlay();
      }
    } catch (error) {
      if ((error as Error)?.name !== 'RenderingCancelledException') console.error(`Failed to render page ${this.pageNumber}`, error);
    } finally {
      this.#busy = false;
      // The zoom may have changed while we were drawing.
      if (this.needsRender && this.host.isNearViewport(this)) void this.render();
    }
  }

  /** Frees memory for pages far from the viewport. */
  release(): void {
    this.#renderTask?.cancel();
    this.canvasWrap.replaceChildren();
    this.textLayer.replaceChildren();
    this.linkLayer.replaceChildren();
    this.overlayGroup.replaceChildren();
    this.#rasterScale = 0;
    this.layersBuilt = false;
    this.el.classList.remove('is-rendered');
  }

  drawOverlay(): void {
    if (!this.baseViewport) return;
    const { width, height, transform } = this.baseViewport;
    this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.overlayGroup.setAttribute('transform', `matrix(${transform.join(' ')})`);
    this.host.drawOverlay(this);
  }

  async #raster(scale: number): Promise<void> {
    const page = this.#pdfPage!;
    const viewport = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    // Cap the backing store so extreme zoom can't exhaust GPU memory.
    const pixelRatio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    this.#renderTask?.cancel();
    this.#renderTask = page.render({
      canvas,
      canvasContext: canvas.getContext('2d', { alpha: false })!,
      viewport,
      transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
      annotationMode: pdfjs.AnnotationMode.ENABLE,
    });
    await this.#renderTask.promise;
    this.canvasWrap.replaceChildren(canvas);
    this.#rasterScale = scale;
    this.el.classList.add('is-rendered');
  }

  /** (Re)builds the selectable text: native text, or OCR words for scanned pages. */
  async buildTextLayer(): Promise<void> {
    if (!this.baseViewport) return;
    this.textLayer.replaceChildren();
    const { text, content } = await this.book.doc.getText(this.pageNumber);
    const useOcr = !text.hasText && this.book.hasOcr(this.pageNumber);
    this.textLayer.classList.toggle('ocr', useOcr);
    if (useOcr) this.#buildOcrTextLayer();
    else await new pdfjs.TextLayer({ textContentSource: content, container: this.textLayer, viewport: this.baseViewport }).render();
    // pdf.js trick: a trailing element stops selections jumping to the page start.
    this.textLayer.append(el('div', { class: 'endOfContent' }));
  }

  // Each recognised word becomes a transparent span stretched over its box.
  #buildOcrTextLayer(): void {
    const measure = (PageView.#measure ??= document.createElement('canvas').getContext('2d')!);
    const { width: pageW, height: pageH } = this.baseViewport!;
    const fragment = document.createDocumentFragment();
    for (const line of this.book.ocr[this.pageNumber].lines) {
      for (const word of line.words) {
        const [left, top, right, bottom] = this.#toViewportRect(word);
        const boxW = right - left;
        const boxH = bottom - top;
        // A trailing space (not a <br>) separates words and lines when copying.
        const text = `${word.t} `;
        measure.font = `${boxH}px sans-serif`;
        const naturalW = measure.measureText(text).width || boxW;
        const span = el('span', { text });
        span.style.cssText = [
          `left:${(left / pageW) * 100}%`,
          `top:${(top / pageH) * 100}%`,
          `font-size:calc(var(--total-scale-factor) * ${boxH}px)`,
          'font-family:sans-serif',
          `transform:scaleX(${(boxW / naturalW).toFixed(4)})`,
        ].join(';');
        fragment.append(span);
      }
    }
    this.textLayer.append(fragment);
  }

  async #buildLinkLayer(): Promise<void> {
    this.linkLayer.replaceChildren();
    const { width: pageW, height: pageH } = this.baseViewport!;
    const pct = (v: number, total: number) => `${(v / total) * 100}%`;
    const annotations = (await this.#pdfPage!.getAnnotations({ intent: 'display' })) as Array<{
      subtype: string;
      url?: string;
      unsafeUrl?: string;
      dest?: string | unknown[];
      rect: number[];
    }>;
    for (const a of annotations) {
      const url = a.url || a.unsafeUrl;
      if (a.subtype !== 'Link' || (!url && !a.dest)) continue;
      const [x1, y1, x2, y2] = a.rect;
      const [left, top, right, bottom] = this.#toViewportRect({ x1, y1, x2, y2 });
      const link = el('a', { class: 'pdf-link', title: url || 'Go to linked location' });
      Object.assign(link.style, { left: pct(left, pageW), top: pct(top, pageH), width: pct(right - left, pageW), height: pct(bottom - top, pageH) });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.host.linksEnabled()) return;
        if (a.dest) this.host.followDestination(a.dest);
        else if (url) this.host.openExternal(url);
      });
      this.linkLayer.append(link);
    }
  }

  // ---- Coordinates ---------------------------------------------------------

  /** PDF rect → scale-1 viewport rect [left, top, right, bottom]. */
  #toViewportRect({ x1, y1, x2, y2 }: PdfRect): [number, number, number, number] {
    const [ax, ay] = this.baseViewport!.convertToViewportPoint(x1, y1);
    const [bx, by] = this.baseViewport!.convertToViewportPoint(x2, y2);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  }

  // Before the first render there is no viewport yet; assume an unrotated page.
  #viewport(): Pick<PageViewport, 'convertToPdfPoint' | 'convertToViewportPoint'> {
    const h = this.book.pageSize(this.pageNumber).h;
    return this.baseViewport ?? { convertToPdfPoint: (x: number, y: number) => [x, h - y], convertToViewportPoint: (x: number, y: number) => [x, h - y] };
  }

  /** Screen point → PDF user space. */
  clientToPdf(clientX: number, clientY: number): [number, number] {
    const r = this.inner.getBoundingClientRect();
    return this.#viewport().convertToPdfPoint((clientX - r.left) / this.scale, (clientY - r.top) / this.scale) as [number, number];
  }

  /** PDF user space → CSS px from the visible box's top-left. */
  pdfToBoxOffset(x: number, y: number): { x: number; y: number } {
    const [vx, vy] = this.#viewport().convertToViewportPoint(x, y);
    const { w, h } = this.book.pageSize(this.pageNumber);
    const crop = this.crop;
    return { x: (vx - crop.x * w) * this.scale, y: (vy - crop.y * h) * this.scale };
  }

  /** Horizontal position of a PDF x coordinate as a fraction of the page width (picks a split half). */
  xFraction(x: number): number {
    const [vx] = this.#viewport().convertToViewportPoint(x, 0);
    return vx / this.book.pageSize(this.pageNumber).w;
  }
}
