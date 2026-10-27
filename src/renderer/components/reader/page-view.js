/**
 * One page on screen, built from stacked layers:
 *
 *   .page                 visible box (sized to the cropped page)
 *   └ .page-inner         full page, shifted to hide cropped margins
 *       ├ .canvas-wrap    pdf.js raster — the only layer redrawn on zoom
 *       ├ .tint           theme tint (multiply blend)
 *       ├ .textLayer      transparent selectable text (native or OCR)
 *       ├ .link-layer     clickable PDF links
 *       └ svg.annot-layer annotations, drawn in PDF user space
 *
 * Everything except the canvas is built once in scale-independent units (CSS
 * variables, percentages, a scale-1 SVG viewBox), so zooming only re-rasters.
 *
 * @typedef {object} PageHost  what a PageView needs from its pane
 * @property {() => {x:number,y:number,w:number,h:number}} cropFor  fractional crop box for a page
 * @property {(dest: any) => void} followDestination
 * @property {(url: string) => void} openExternal
 * @property {() => boolean} linksEnabled
 * @property {(pageView: PageView) => void} drawOverlay
 * @property {(pageView: PageView) => boolean} isNearViewport
 */
import { pdfjs } from '../../models/pdf-document.js';
import { el, svgEl } from '../common/dom.js';

const MAX_CANVAS_PIXELS = 24e6;
const NO_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

export class PageView {
  /**
   * @param {import('../../models/book.js').Book} book
   * @param {number} pageNumber
   * @param {PageHost} host
   */
  constructor(book, pageNumber, host) {
    this.book = book;
    this.pageNumber = pageNumber;
    this.host = host;
    this.scale = 1;
    this.rasterScale = 0; // scale of the current canvas; 0 = none
    this.layersBuilt = false;
    this.busy = false;

    this.canvasWrap = el('div', { class: 'canvas-wrap' });
    this.textLayer = el('div', { class: 'textLayer' });
    this.linkLayer = el('div', { class: 'link-layer' });
    this.overlay = svgEl('svg', { class: 'annot-layer', preserveAspectRatio: 'none' });
    /** Annotation renderers draw into this group, in PDF user space. */
    this.overlayGroup = svgEl('g');
    this.overlay.append(this.overlayGroup);
    this.inner = el('div', { class: 'page-inner' }, [this.canvasWrap, el('div', { class: 'tint' }), this.textLayer, this.linkLayer, this.overlay]);
    this.el = el('div', { class: 'page', dataset: { page: pageNumber } }, [this.inner]);
    this.el.pageView = this; // lets event handlers find the view from a DOM node
  }

  get crop() {
    return this.host.cropFor(this.pageNumber) ?? NO_CROP;
  }

  /** Size of the visible (cropped) page box at `scale`, in CSS px. */
  displaySize(scale = this.scale) {
    const { w, h } = this.book.pageSize(this.pageNumber);
    const crop = this.crop;
    return { w: w * crop.w * scale, h: h * crop.h * scale };
  }

  get needsRender() {
    return !this.layersBuilt || Math.abs(this.rasterScale - this.scale) > 1e-3;
  }

  /** Resizes the boxes immediately; the canvas catches up on the next render(). */
  setScale(scale) {
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
    // pdf.js text layer sizing reads these variables.
    this.el.style.setProperty('--scale-factor', scale);
    this.el.style.setProperty('--total-scale-factor', scale);
    this.el.style.setProperty('--user-unit', 1);
  }

  async render() {
    if (this.busy || !this.needsRender) return;
    this.busy = true;
    const scale = this.scale;
    try {
      this.pdfPage ??= await this.book.doc.getPage(this.pageNumber);
      this.baseViewport ??= this.pdfPage.getViewport({ scale: 1 });
      if (Math.abs(this.rasterScale - scale) > 1e-3) await this.#raster(scale);
      if (!this.layersBuilt) {
        this.layersBuilt = true;
        await Promise.all([this.buildTextLayer(), this.#buildLinkLayer()]);
        this.drawOverlay();
      }
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') console.error(`Failed to render page ${this.pageNumber}`, error);
    } finally {
      this.busy = false;
      // The zoom may have changed while we were drawing.
      if (this.needsRender && this.host.isNearViewport(this)) this.render();
    }
  }

  /** Frees memory for pages far from the viewport. */
  release() {
    this.renderTask?.cancel();
    this.canvasWrap.replaceChildren();
    this.textLayer.replaceChildren();
    this.linkLayer.replaceChildren();
    this.overlayGroup.replaceChildren();
    this.rasterScale = 0;
    this.layersBuilt = false;
    this.el.classList.remove('is-rendered');
  }

  drawOverlay() {
    if (!this.baseViewport) return;
    const { width, height, transform } = this.baseViewport;
    this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.overlayGroup.setAttribute('transform', `matrix(${transform.join(' ')})`);
    this.host.drawOverlay(this);
  }

  async #raster(scale) {
    const viewport = this.pdfPage.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    // Cap the backing store so extreme zoom can't exhaust GPU memory.
    const pixelRatio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    this.renderTask?.cancel();
    this.renderTask = this.pdfPage.render({
      canvas,
      canvasContext: canvas.getContext('2d', { alpha: false }),
      viewport,
      transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
      annotationMode: pdfjs.AnnotationMode.ENABLE,
    });
    await this.renderTask.promise;
    this.canvasWrap.replaceChildren(canvas);
    this.rasterScale = scale;
    this.el.classList.add('is-rendered');
  }

  /** (Re)builds the selectable text: native text if the PDF has it, else OCR words. */
  async buildTextLayer() {
    if (!this.baseViewport) return;
    this.textLayer.replaceChildren();
    const { text, content } = await this.book.doc.getText(this.pageNumber);
    const useOcr = !text.hasText && this.book.hasOcr(this.pageNumber);
    this.textLayer.classList.toggle('ocr', useOcr);
    if (useOcr) {
      this.#buildOcrTextLayer();
    } else {
      await new pdfjs.TextLayer({ textContentSource: content, container: this.textLayer, viewport: this.baseViewport }).render();
    }
    // pdf.js trick: a trailing element stops selections from jumping to the page start.
    this.textLayer.append(el('div', { class: 'endOfContent' }));
  }

  // Each recognised word becomes a transparent span stretched over its box.
  #buildOcrTextLayer() {
    const measure = (PageView.measureContext ??= document.createElement('canvas').getContext('2d'));
    const { width: pageW, height: pageH } = this.baseViewport;
    const fragment = document.createDocumentFragment();
    for (const line of this.book.ocr[this.pageNumber].lines) {
      line.words.forEach((word, i) => {
        const [x1, y1, x2, y2] = this.baseViewport.convertToViewportRectangle([word.x1, word.y1, word.x2, word.y2]);
        const boxW = Math.abs(x2 - x1);
        const boxH = Math.abs(y2 - y1);
        const text = i < line.words.length - 1 ? `${word.t} ` : word.t;
        measure.font = `${boxH}px sans-serif`;
        const naturalW = measure.measureText(text).width || boxW;
        const span = el('span', { text });
        span.style.cssText = [
          `left:${(Math.min(x1, x2) / pageW) * 100}%`,
          `top:${(Math.min(y1, y2) / pageH) * 100}%`,
          `font-size:calc(var(--total-scale-factor) * ${boxH}px)`,
          'font-family:sans-serif',
          `transform:scaleX(${(boxW / naturalW).toFixed(4)})`,
        ].join(';');
        fragment.append(span);
      });
      fragment.append(el('br'));
    }
    this.textLayer.append(fragment);
  }

  async #buildLinkLayer() {
    this.linkLayer.replaceChildren();
    const { width: pageW, height: pageH } = this.baseViewport;
    const annotations = await this.pdfPage.getAnnotations({ intent: 'display' });
    for (const a of annotations) {
      const url = a.url || a.unsafeUrl;
      if (a.subtype !== 'Link' || (!url && !a.dest)) continue;
      const [x1, y1, x2, y2] = this.baseViewport.convertToViewportRectangle(a.rect);
      const pct = (v, total) => `${(v / total) * 100}%`;
      const link = el('a', {
        class: 'pdf-link',
        title: url || 'Go to linked location',
        style: { left: pct(Math.min(x1, x2), pageW), top: pct(Math.min(y1, y2), pageH), width: pct(Math.abs(x2 - x1), pageW), height: pct(Math.abs(y2 - y1), pageH) },
        onclick: (e) => {
          e.preventDefault();
          if (!this.host.linksEnabled()) return;
          if (a.dest) this.host.followDestination(a.dest);
          else this.host.openExternal(url);
        },
      });
      this.linkLayer.append(link);
    }
  }

  // ---- Coordinates ---------------------------------------------------------
  // Before the first render there is no viewport yet; assume an unrotated page.
  #viewport() {
    const h = this.book.pageSize(this.pageNumber).h;
    return this.baseViewport ?? { convertToPdfPoint: (x, y) => [x, h - y], convertToViewportPoint: (x, y) => [x, h - y] };
  }

  /** Screen point → PDF user space. @returns {[number, number]} */
  clientToPdf(clientX, clientY) {
    const r = this.inner.getBoundingClientRect();
    return this.#viewport().convertToPdfPoint((clientX - r.left) / this.scale, (clientY - r.top) / this.scale);
  }

  /** PDF user space → CSS px offset from the visible page box's top-left. */
  pdfToBoxOffset(x, y) {
    const [vx, vy] = this.#viewport().convertToViewportPoint(x, y);
    const { w, h } = this.book.pageSize(this.pageNumber);
    const crop = this.crop;
    return { x: (vx - crop.x * w) * this.scale, y: (vy - crop.y * h) * this.scale };
  }
}
