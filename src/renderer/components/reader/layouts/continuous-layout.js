/**
 * Continuous vertical scrolling: every page is a placeholder of the right
 * size in one column; only pages near the viewport are rendered, and pages
 * far away are released to bound memory on 1000-page books.
 */
import { el } from '../../common/dom.js';

const PAGE_GAP_PX = 14;
const PADDING_PX = 24;
const RENDER_AHEAD = 2; // pages beyond the viewport to pre-render
const RELEASE_BEYOND = 10; // pages beyond the viewport before releasing

export class ContinuousLayout {
  /** @param {import('../reader-pane.js').ReaderPane} pane */
  constructor(pane) {
    this.pane = pane;
    this.scroller = pane.scroller;
    this.pages = [];
    this.padding = PADDING_PX;
  }

  mount(scale) {
    this.pages = [];
    const column = el('div', { class: 'column', style: { gap: `${PAGE_GAP_PX}px`, padding: `${PADDING_PX}px` } });
    for (let n = 1; n <= this.pane.book.numPages; n++) {
      const pv = this.pane.pageView(n);
      pv.setScale(scale);
      column.append(pv.el);
      this.pages.push(pv);
    }
    this.scroller.replaceChildren(column);
  }

  /** Width/height the zoom presets should fit: the current page. */
  fitTarget(page) {
    return this.pane.pageView(page).displaySize(1);
  }

  onScroll() {
    const top = this.scroller.scrollTop;
    const height = this.scroller.clientHeight;
    const first = this.#indexAt(top);
    const last = this.#indexAt(top + height);
    // The "current" page is the one crossing a third of the way down.
    this.pane.reportPage(this.#indexAt(top + height / 3) + 1);

    for (let i = Math.max(0, first - RENDER_AHEAD); i <= Math.min(this.pages.length - 1, last + RENDER_AHEAD); i++) {
      this.pages[i].render();
    }
    for (const pv of this.pages) {
      const i = pv.pageNumber - 1;
      if (pv.layersBuilt && (i < first - RELEASE_BEYOND || i > last + RELEASE_BEYOND)) pv.release();
    }
  }

  isNear(pv) {
    return Math.abs(pv.pageNumber - this.pane.currentPage) <= RENDER_AHEAD + 3;
  }

  /** @returns {import('../../../lib/history.js').Position} PDF point at the top-left of the viewport */
  currentPosition() {
    const pv = this.pages[this.#indexAt(this.scroller.scrollTop + 1)];
    const viewport = this.scroller.getBoundingClientRect();
    const box = pv.el.getBoundingClientRect();
    const [x, y] = pv.clientToPdf(Math.max(box.left, viewport.left), Math.max(box.top, viewport.top));
    return { page: pv.pageNumber, x, y };
  }

  scrollTo({ page, x, y }, { smooth = false } = {}) {
    const pv = this.pane.pageView(page);
    const hasPoint = y != null;
    const offset = hasPoint ? pv.pdfToBoxOffset(x ?? 0, y) : { x: 0, y: 0 };
    const viewport = this.scroller.getBoundingClientRect();
    const box = pv.el.getBoundingClientRect();
    // Leave a little headroom above a target point so it isn't flush with the edge.
    const top = this.scroller.scrollTop + (box.top - viewport.top) + offset.y - (hasPoint ? 40 : PADDING_PX / 2);
    const wide = this.scroller.scrollWidth > this.scroller.clientWidth;
    const left = wide ? this.scroller.scrollLeft + (box.left - viewport.left) + offset.x - 40 : 0;
    this.scroller.scrollTo({ top, left, behavior: smooth ? 'smooth' : 'auto' });
    this.pane.reportPage(page);
    this.onScroll();
  }

  next() {
    this.scroller.scrollBy({ top: this.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  previous() {
    this.scroller.scrollBy({ top: -this.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  /** Wheel events scroll natively in this layout. */
  onWheel() {
    return false;
  }

  /** Binary search: index of the first page whose bottom edge is below `y`. */
  #indexAt(y) {
    let lo = 0;
    let hi = this.pages.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const node = this.pages[mid].el;
      if (node.offsetTop + node.offsetHeight < y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
