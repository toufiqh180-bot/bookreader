/**
 * A reading pane over one Book. A tab shows one pane, or two side by side in
 * split screen; both share the Book, so annotations, bookmarks and history
 * stay in sync. Only the primary pane writes view settings to the session.
 *
 * Responsibilities:
 *   - page slots (whole pages, or halves of two-page scans) and their PageViews
 *   - layout strategy: ContinuousLayout or PagedLayout
 *   - zoom, margin crop, reflow view, auto-scroll
 *   - positions, navigation and browser-style history
 *
 * The rest of the app talks in PDF pages (`Position`); slots stay internal.
 *
 * Events: `page(pdfPage)` when the visible page changes; `view` when mode,
 * zoom, crop, reflow or auto-scroll change.
 */
import { PageView, type PageHost } from './page-view.ts';
import { ContinuousLayout } from './layouts/continuous-layout.ts';
import { PagedLayout } from './layouts/paged-layout.ts';
import { PAGE_INSETS } from './layouts/insets.ts';
import { ReflowView, type ReflowSettings } from './reflow-view.ts';
import { AutoScroller } from './auto-scroller.ts';
import type { Layout, LayoutHost, SlotTarget } from './layouts/layout.ts';
import type { PageTransition } from './layouts/page-turn.ts';
import { buildSlots, slotFor, type PageSlot } from '../lib/page-slots.ts';
import { Emitter, clamp } from '../lib/util.ts';
import { el } from './dom.ts';
import type { Book } from '../models/book.ts';
import type { CropBox, PdfRect, Position, ViewMode, ZoomMode } from '../models/types.ts';

export const VIEW_MODES: ViewMode[] = ['continuous', 'single', 'two-page'];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
/** Default continuous zoom: fit width, but no larger than this. */
const AUTO_ZOOM_CAP = 1.6;

/** Collaborators supplied by the app. */
export interface PaneServices {
  drawOverlay(view: PageView): void;
  flash(view: PageView, rects: PdfRect[]): void;
  /** Links and tap-to-turn only work with the select tool. */
  isSelectTool(): boolean;
  pageTransition(): PageTransition;
  onActivate(pane: ReaderPane): void;
  openExternal(url: string): void;
}

export class ReaderPane extends Emitter<{ page: [page: number]; view: [] }> implements LayoutHost {
  readonly book: Book;
  readonly primary: boolean;
  readonly el: HTMLDivElement;
  readonly scroller: HTMLDivElement;
  readonly reflow: ReflowView;
  readonly autoScroller: AutoScroller;
  mode: ViewMode;
  zoomMode: ZoomMode;
  scale = 1;
  cropEnabled: boolean;
  splitSpreads: boolean;
  currentSlot = 1;
  slots: PageSlot[] = [];
  readonly #services: PaneServices;
  readonly #views = new Map<number, PageView>();
  #layout: Layout | null = null;
  #zoom: number;
  #scrollFrame = 0;
  #resizeTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #resizeObserver: ResizeObserver;
  readonly #unsubscribe: Array<() => void>;

  constructor(book: Book, services: PaneServices, { primary = true, autoScrollSpeed = 60 } = {}) {
    super();
    this.book = book;
    this.#services = services;
    this.primary = primary;

    const s = book.session;
    this.mode = VIEW_MODES.includes(s.viewMode) ? s.viewMode : 'continuous';
    this.zoomMode = s.zoomMode ?? 'auto';
    this.#zoom = s.zoomLevel ?? 1;
    this.cropEnabled = Boolean(s.isMarginCropped && book.crop);
    this.splitSpreads = Boolean(s.splitSpreads);
    this.slots = buildSlots(book.pageSizes, this.splitSpreads);
    this.currentSlot = slotFor(this.slots, clamp(s.lastPage || 1, 1, book.numPages)).index;

    this.scroller = el('div', { class: 'scroller', tabindex: 0 });
    this.reflow = new ReflowView(book, {
      onPageChange: (page) => this.#reportPage(page),
      onShowPage: (page) => this.setReflow(false, page),
    });
    this.autoScroller = new AutoScroller(autoScrollSpeed);
    this.autoScroller.on('change', () => this.emit('view'));
    this.el = el('div', { class: 'pane' }, [this.scroller, this.reflow.el]);

    this.scroller.addEventListener('scroll', () => this.#scheduleScrollUpdate(), { passive: true });
    this.scroller.addEventListener('wheel', (e) => this.#onWheel(e), { passive: false });
    this.el.addEventListener('pointerdown', () => services.onActivate(this), true);
    this.#resizeObserver = new ResizeObserver(() => this.#onResize());
    this.#resizeObserver.observe(this.el);
    this.#unsubscribe = [book.annotations.on('change', (page) => this.redrawOverlays(page)), book.on('ocr', (page) => this.#onOcr(page))];
  }

  // ---- LayoutHost -------------------------------------------------------------

  get slotCount(): number {
    return this.slots.length;
  }

  pageView(slot: number): PageView {
    let view = this.#views.get(slot);
    if (!view) {
      view = new PageView(this.book, this.slots[slot - 1], this.#pageHost);
      this.#views.set(slot, view);
    }
    return view;
  }

  forEachView(fn: (view: PageView) => void): void {
    this.#views.forEach(fn);
  }

  reportSlot(slot: number): void {
    const changed = slot !== this.currentSlot;
    this.currentSlot = slot;
    if (changed || !this.#reported) this.#reportPage(this.currentPage);
  }

  #reported = false;

  #reportPage(page: number): void {
    this.#reported = true;
    if (this.reflow.active) this.currentSlot = slotFor(this.slots, page).index;
    if (this.primary && this.book.session.lastPage !== page) this.book.updateSession({ lastPage: page });
    this.emit('page', page);
  }

  linksEnabled(): boolean {
    return this.#services.isSelectTool();
  }

  pageTransition(): PageTransition {
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : this.#services.pageTransition();
  }

  readonly #pageHost: PageHost = {
    marginCrop: (page: number): CropBox | null => (this.cropEnabled && this.book.crop ? this.book.crop[page % 2 ? 'odd' : 'even'] : null),
    followDestination: (dest) => void this.followDestination(dest),
    openExternal: (url) => this.#services.openExternal(url),
    linksEnabled: () => this.linksEnabled(),
    drawOverlay: (view) => this.#services.drawOverlay(view),
    isNearViewport: (view) => this.#layout?.isNear(view) ?? false,
  };

  // ---- Pages ------------------------------------------------------------------

  /** PDF page currently in view. */
  get currentPage(): number {
    return this.slots[this.currentSlot - 1]?.pageNumber ?? 1;
  }

  get isPaged(): boolean {
    return this.mode !== 'continuous';
  }

  /** Every on-screen view of a PDF page (two when a scan is split). */
  viewsForPage(page: number): PageView[] {
    return [...this.#views.values()].filter((v) => v.pageNumber === page);
  }

  #toSlotTarget({ page, x, y }: Position): SlotTarget {
    const pageNumber = clamp(page || 1, 1, this.book.numPages);
    let xFraction: number | null = null;
    if (x != null && this.splitSpreads) xFraction = this.pageView(slotFor(this.slots, pageNumber).index).xFraction(x);
    return { slot: slotFor(this.slots, pageNumber, xFraction).index, x, y };
  }

  // ---- Layout -----------------------------------------------------------------

  /** Builds (or rebuilds) the arrangement, landing on `position` (default: where we are). */
  relayout(position: Position = this.currentPosition()): void {
    const target = this.#toSlotTarget(position);
    this.currentSlot = target.slot;
    this.#layout = this.isPaged ? new PagedLayout(this, this.mode as 'single' | 'two-page') : new ContinuousLayout(this);
    this.scale = this.#computeScale(this.#layout);
    this.#layout.mount(this.scale);
    this.#layout.scrollTo(target);
    this.el.dataset.mode = this.mode;
    this.#persist();
    this.emit('view');
  }

  #computeScale(layout: Layout): number {
    if (this.zoomMode === 'custom') return clamp(this.#zoom, MIN_ZOOM, MAX_ZOOM);
    const availableW = Math.max(100, this.scroller.clientWidth - PAGE_INSETS.x * 2);
    const availableH = Math.max(100, this.scroller.clientHeight - PAGE_INSETS.top - PAGE_INSETS.bottom);
    const { w, h } = layout.fitTarget(this.currentSlot);
    const fitWidth = availableW / w;
    const fitPage = Math.min(fitWidth, availableH / h);
    if (this.zoomMode === 'fit-width') return fitWidth;
    if (this.zoomMode === 'fit-page') return fitPage;
    return this.isPaged ? fitPage : Math.min(fitWidth, AUTO_ZOOM_CAP);
  }

  #scheduleScrollUpdate(): void {
    if (this.#scrollFrame) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = 0;
      this.#layout?.onScroll();
    });
  }

  #onResize(): void {
    // A hidden scroller has no size; leaving reflow relayouts anyway.
    if (!this.#layout || this.zoomMode === 'custom' || this.reflow.active) return;
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => this.relayout(), 120);
  }

  #onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel.
      event.preventDefault();
      this.zoomBy(Math.exp(-event.deltaY * 0.01));
    } else if (this.#layout?.onWheel(event)) {
      event.preventDefault();
    }
  }

  // ---- View settings ----------------------------------------------------------

  setMode(mode: ViewMode): void {
    if (this.reflow.active) this.setReflow(false);
    if (mode === this.mode) return;
    if (this.zoomMode === 'custom') this.zoomMode = 'auto';
    if (mode !== 'continuous') this.autoScroller.stop();
    this.mode = mode;
    this.relayout();
  }

  /** Continuous ⇄ single page (Ctrl/⌘+M). */
  toggleMode(): void {
    this.setMode(this.isPaged ? 'continuous' : 'single');
  }

  setZoom(mode: ZoomMode, value?: number): void {
    this.zoomMode = mode;
    if (mode === 'custom' && value != null) this.#zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.relayout();
  }

  zoomBy(factor: number): void {
    this.setZoom('custom', this.scale * factor);
  }

  setCrop(enabled: boolean): void {
    this.cropEnabled = enabled && Boolean(this.book.crop);
    this.#views.forEach((v) => v.release());
    this.relayout();
  }

  /** Shows each two-page scan as two pages (or back to whole scans). */
  setSplitSpreads(split: boolean): void {
    if (split === this.splitSpreads) return;
    const position = this.currentPosition();
    this.splitSpreads = split;
    this.slots = buildSlots(this.book.pageSizes, split);
    this.#views.forEach((v) => v.release());
    this.#views.clear();
    this.relayout(position);
  }

  setReflow(active: boolean, page = this.currentPage): void {
    if (active === this.reflow.active) return;
    if (active) {
      this.scroller.hidden = true;
      void this.reflow.open(page);
      this.autoScroller.retarget(this.reflow.scroller);
    } else {
      this.reflow.close();
      this.scroller.hidden = false;
      this.relayout({ page, x: null, y: null });
      this.autoScroller.retarget(this.scroller);
    }
    this.el.toggleAttribute('data-reflow', active);
    this.emit('view');
  }

  applyReflowSettings(settings: ReflowSettings): void {
    this.reflow.applySettings(settings);
  }

  #persist(): void {
    if (!this.primary) return;
    this.book.updateSession({
      viewMode: this.mode,
      zoomMode: this.zoomMode,
      zoomLevel: Math.round(this.scale * 1000) / 1000,
      isMarginCropped: this.cropEnabled,
      splitSpreads: this.splitSpreads,
    });
  }

  // ---- Navigation -------------------------------------------------------------

  currentPosition(): Position {
    if (this.reflow.active || !this.#layout) return { page: this.currentPage, x: null, y: null };
    const { slot, x, y } = this.#layout.currentTarget();
    return { page: this.slots[slot - 1].pageNumber, x, y };
  }

  /** Moves without recording history (scrolling, stepping through search hits). */
  scrollTo(position: Position): void {
    if (this.reflow.active) this.reflow.scrollToPage(clamp(position.page, 1, this.book.numPages));
    else this.#layout?.scrollTo(this.#toSlotTarget(position));
  }

  /** A jump the reader may want to undo with Back (links, contents, bookmarks…). */
  navigate(target: Position, { flash }: { flash?: PdfRect[] } = {}): void {
    this.book.recordJump(this.currentPosition(), target);
    this.scrollTo(target);
    if (flash?.length) void this.flash(target.page, flash);
  }

  async followDestination(dest: string | unknown[]): Promise<void> {
    const target = await this.book.doc.resolveDestination(dest).catch(() => null);
    if (target) this.navigate(target);
  }

  back(): void {
    const entry = this.book.stepHistory(this.currentPosition(), -1);
    if (entry) this.scrollTo(entry);
  }

  forward(): void {
    const entry = this.book.stepHistory(this.currentPosition(), 1);
    if (entry) this.scrollTo(entry);
  }

  next(): void {
    if (this.reflow.active) this.reflow.pageDown();
    else this.#layout?.next();
  }

  previous(): void {
    if (this.reflow.active) this.reflow.pageUp();
    else this.#layout?.previous();
  }

  /** Briefly outlines rectangles on a page (search hits, linked passages). */
  async flash(page: number, rects: PdfRect[]): Promise<void> {
    if (this.reflow.active || !rects.length) return;
    const { slot } = this.#toSlotTarget({ page, x: Math.min(rects[0].x1, rects[0].x2) });
    const view = this.pageView(slot);
    await view.render();
    this.#services.flash(view, rects);
  }

  // ---- Auto-scroll --------------------------------------------------------------

  toggleAutoScroll(): void {
    if (this.autoScroller.active) {
      this.autoScroller.stop();
      return;
    }
    if (!this.reflow.active && this.isPaged) this.setMode('continuous');
    this.autoScroller.start(this.reflow.active ? this.reflow.scroller : this.scroller);
  }

  // ---- Redraws --------------------------------------------------------------------

  redrawOverlays(page?: number): void {
    for (const view of this.#views.values()) if (view.layersBuilt && (page == null || view.pageNumber === page)) view.drawOverlay();
  }

  #onOcr(page: number): void {
    for (const view of this.viewsForPage(page)) void view.buildTextLayer();
    this.reflow.invalidate();
  }

  destroy(): void {
    this.autoScroller.stop();
    this.#unsubscribe.forEach((off) => off());
    this.#resizeObserver.disconnect();
    this.#views.forEach((v) => v.release());
    this.el.remove();
  }
}
