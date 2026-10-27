/**
 * A reading pane over one Book. A tab shows one pane, or two side by side in
 * split-screen; both share the Book, so annotations, bookmarks and history
 * stay in sync. Only the primary pane writes view settings to the session.
 *
 * Responsibilities:
 *   - owns the PageViews and delegates arrangement to a layout strategy
 *     (ContinuousLayout or PagedLayout)
 *   - zoom (auto / fit page / fit width / custom) and margin crop
 *   - positions, navigation and browser-style history
 *   - reflow view and auto-scroll
 *
 * Events:
 *   'page'  (page)  current page changed
 *   'view'          mode, zoom, crop, reflow or auto-scroll state changed
 */
import { PageView } from './page-view.js';
import { ContinuousLayout } from './layouts/continuous-layout.js';
import { PagedLayout } from './layouts/paged-layout.js';
import { ReflowView } from './reflow-view.js';
import { AutoScroller } from './auto-scroller.js';
import { Emitter, clamp } from '../../lib/util.js';
import { el } from '../common/dom.js';

export const VIEW_MODES = ['continuous', 'single', 'two-page'];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
/** Default continuous zoom: fit width, but never larger than this. */
const AUTO_ZOOM_CAP = 1.6;

/**
 * @typedef {object} PaneServices  collaborators supplied by the App
 * @property {(pv: PageView) => void} drawOverlay  paints annotations & search hits
 * @property {() => boolean} isSelectTool          links/flip-clicks only work with the select tool
 * @property {() => boolean} animationsEnabled
 * @property {(pane: ReaderPane) => void} onActivate
 * @property {(page: number, rects: object[]) => void} [flash]
 */

export class ReaderPane extends Emitter {
  /**
   * @param {import('../../models/book.js').Book} book
   * @param {PaneServices} services
   * @param {{ primary?: boolean, autoScrollSpeed?: number }} [options]
   */
  constructor(book, services, { primary = true, autoScrollSpeed } = {}) {
    super();
    this.book = book;
    this.services = services;
    this.primary = primary;

    const session = book.session;
    this.mode = VIEW_MODES.includes(session.viewMode) ? session.viewMode : 'continuous';
    this.zoomMode = session.zoomMode ?? 'auto';
    this.zoom = session.zoomLevel ?? 1;
    this.cropEnabled = Boolean(session.isMarginCropped && book.crop);
    this.currentPage = clamp(session.lastPage || 1, 1, book.numPages);
    this.scale = 1;

    /** @type {Map<number, PageView>} */
    this.pageViews = new Map();
    this.scroller = el('div', { class: 'scroller', tabindex: '0' });
    this.reflow = new ReflowView(book, {
      onPageChange: (page) => this.reportPage(page),
      onShowPage: (page) => this.setReflow(false, page),
    });
    this.autoScroller = new AutoScroller(autoScrollSpeed);
    this.autoScroller.on('change', () => this.emit('view'));
    this.el = el('div', { class: 'pane' }, [this.scroller, this.reflow.el]);

    this.scroller.addEventListener('scroll', () => this.#scheduleScrollUpdate(), { passive: true });
    this.scroller.addEventListener('wheel', (e) => this.#onWheel(e), { passive: false });
    this.el.addEventListener('pointerdown', () => services.onActivate(this), true);
    this.resizeObserver = new ResizeObserver(() => this.#onResize());
    this.resizeObserver.observe(this.el);
    this.unsubscribe = [book.annotations.on('change', (page) => this.redrawOverlays(page)), book.on('ocr', (page) => this.#onOcr(page))];
  }

  // ---- PageHost (see page-view.js) -----------------------------------------

  pageView(n) {
    if (!this.pageViews.has(n)) {
      this.pageViews.set(n, new PageView(this.book, n, this.#pageHost));
    }
    return this.pageViews.get(n);
  }

  #pageHost = {
    cropFor: (page) => (this.cropEnabled && this.book.crop ? this.book.crop[page % 2 ? 'odd' : 'even'] : null),
    followDestination: (dest) => this.followDestination(dest),
    openExternal: (url) => window.open(url, '_blank'),
    linksEnabled: () => this.linksEnabled(),
    drawOverlay: (pv) => this.services.drawOverlay(pv),
    isNearViewport: (pv) => this.layout?.isNear(pv) ?? false,
  };

  linksEnabled() {
    return this.services.isSelectTool();
  }

  animationsEnabled() {
    return this.services.animationsEnabled() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---- Layout ---------------------------------------------------------------

  get isPaged() {
    return this.mode !== 'continuous';
  }

  /**
   * Builds (or rebuilds) the page arrangement.
   * @param {import('../../lib/history.js').Position} [position]  where to land; defaults to the current spot
   */
  relayout(position = this.currentPosition()) {
    this.layout = this.isPaged ? new PagedLayout(this, this.mode) : new ContinuousLayout(this);
    this.scale = this.#computeScale();
    this.layout.mount(this.scale);
    this.layout.scrollTo(position);
    this.el.dataset.mode = this.mode;
    this.#persist();
    this.emit('view');
  }

  #computeScale() {
    if (this.zoomMode === 'custom') return clamp(this.zoom, MIN_ZOOM, MAX_ZOOM);
    const padding = this.layout.padding * 2;
    const availableW = Math.max(100, this.scroller.clientWidth - padding);
    const availableH = Math.max(100, this.scroller.clientHeight - padding);
    const { w, h } = this.layout.fitTarget(this.currentPage);
    const fitWidth = availableW / w;
    const fitPage = Math.min(fitWidth, availableH / h);
    if (this.zoomMode === 'fit-width') return fitWidth;
    if (this.zoomMode === 'fit-page') return fitPage;
    return this.isPaged ? fitPage : Math.min(fitWidth, AUTO_ZOOM_CAP);
  }

  #scheduleScrollUpdate() {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      this.layout?.onScroll();
    });
  }

  #onResize() {
    // A hidden scroller has no size; leaving reflow relayouts anyway.
    if (!this.layout || this.zoomMode === 'custom' || this.reflow.active) return;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.relayout(), 120);
  }

  #onWheel(event) {
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel.
      event.preventDefault();
      this.zoomBy(Math.exp(-event.deltaY * 0.01));
    } else if (this.layout?.onWheel(event)) {
      event.preventDefault();
    }
  }

  /** Called by layouts and the reflow view when the visible page changes. */
  reportPage(page) {
    if (page === this.currentPage && this.hasReported) return;
    this.hasReported = true;
    this.currentPage = page;
    if (this.primary) {
      this.book.session.lastPage = page;
      this.book.save();
    }
    this.emit('page', page);
  }

  // ---- View settings --------------------------------------------------------

  setMode(mode) {
    if (this.reflow.active) this.setReflow(false);
    if (mode === this.mode || !VIEW_MODES.includes(mode)) return;
    if (this.zoomMode === 'custom') this.zoomMode = 'auto';
    if (mode !== 'continuous') this.autoScroller.stop();
    this.mode = mode;
    this.relayout();
  }

  /** Continuous ⇄ single page (Ctrl/Cmd+M). */
  toggleMode() {
    this.setMode(this.isPaged ? 'continuous' : 'single');
  }

  setZoom(mode, value) {
    this.zoomMode = mode;
    if (mode === 'custom') this.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.relayout();
  }

  zoomBy(factor) {
    this.setZoom('custom', this.scale * factor);
  }

  setCrop(enabled) {
    this.cropEnabled = enabled && Boolean(this.book.crop);
    for (const pv of this.pageViews.values()) pv.release();
    this.relayout();
  }

  setReflow(active, page = this.currentPage) {
    if (active === this.reflow.active) return;
    if (active) {
      this.scroller.hidden = true;
      this.reflow.open(page);
      if (this.autoScroller.active) this.autoScroller.start(this.reflow.scroller);
    } else {
      this.reflow.close();
      this.scroller.hidden = false;
      this.currentPage = page;
      this.relayout({ page, x: null, y: null });
      if (this.autoScroller.active) this.autoScroller.start(this.scroller);
    }
    this.el.toggleAttribute('data-reflow', active);
    this.emit('view');
  }

  #persist() {
    if (!this.primary) return;
    Object.assign(this.book.session, {
      viewMode: this.mode,
      zoomMode: this.zoomMode,
      zoomLevel: Math.round(this.scale * 1000) / 1000,
      isMarginCropped: this.cropEnabled,
    });
    this.book.save();
  }

  // ---- Navigation -----------------------------------------------------------

  /** @returns {import('../../lib/history.js').Position} */
  currentPosition() {
    if (this.reflow.active || !this.layout) return { page: this.currentPage, x: null, y: null };
    return this.layout.currentPosition();
  }

  /** Moves without recording history (scrolling, stepping through search hits). */
  scrollTo(position) {
    const page = clamp(position.page || 1, 1, this.book.numPages);
    if (this.reflow.active) this.reflow.scrollToPage(page);
    else this.layout.scrollTo({ ...position, page });
  }

  /** A jump the reader may want to undo with Back (links, TOC, bookmarks…). */
  navigate(target, { flash } = {}) {
    this.book.recordJump(this.currentPosition(), target);
    this.scrollTo(target);
    if (flash?.length) this.flash(target.page, flash);
  }

  async followDestination(dest) {
    const target = await this.book.doc.resolveDestination(dest).catch(() => null);
    if (target) this.navigate(target);
  }

  back() {
    const entry = this.book.stepHistory(this.currentPosition(), -1);
    if (entry) this.scrollTo(entry);
  }

  forward() {
    const entry = this.book.stepHistory(this.currentPosition(), 1);
    if (entry) this.scrollTo(entry);
  }

  next() {
    if (this.reflow.active) this.reflow.pageDown();
    else this.layout.next();
  }

  previous() {
    if (this.reflow.active) this.reflow.pageUp();
    else this.layout.previous();
  }

  /** Briefly outlines rectangles on a page (search hits, linked passages). */
  async flash(page, rects) {
    if (this.reflow.active) return;
    const pv = this.pageView(page);
    await pv.render();
    this.services.flash?.(pv, rects);
  }

  // ---- Auto-scroll ----------------------------------------------------------

  toggleAutoScroll() {
    if (this.autoScroller.active) {
      this.autoScroller.stop();
      return;
    }
    if (!this.reflow.active && this.isPaged) this.setMode('continuous');
    this.autoScroller.start(this.reflow.active ? this.reflow.scroller : this.scroller);
  }

  // ---- Redraws --------------------------------------------------------------

  redrawOverlays(page) {
    const views = page ? [this.pageViews.get(page)] : this.pageViews.values();
    for (const pv of views) if (pv?.layersBuilt) pv.drawOverlay();
  }

  #onOcr(page) {
    this.pageViews.get(page)?.buildTextLayer();
    this.reflow.invalidate();
  }

  destroy() {
    this.autoScroller.stop();
    this.unsubscribe.forEach((off) => off());
    this.resizeObserver.disconnect();
    for (const pv of this.pageViews.values()) pv.release();
    this.el.remove();
  }
}
