/**
 * Page-flip reading: one page ('single') or a book spread ('two-page', with
 * the cover on its own like a printed book). Next/previous animate a page
 * turn; the mouse wheel and trackpad swipes flip pages once the current page
 * is scrolled to its edge.
 */
import { el } from '../../common/dom.js';
import { clamp } from '../../../lib/util.js';

const PADDING_PX = 24;
const TURN_DURATION_MS = 420;
const WHEEL_THRESHOLD = 60;
const WHEEL_COOLDOWN_MS = 450;

/**
 * Pages shown together with `page`. Two-page spreads are [1], [2,3], [4,5]…
 * @param {'single'|'two-page'} mode
 */
export function spreadFor(page, mode, pageCount) {
  if (mode !== 'two-page' || page === 1) return [page];
  const left = page % 2 === 0 ? page : page - 1;
  return left + 1 <= pageCount ? [left, left + 1] : [left];
}

export class PagedLayout {
  /** @param {import('../reader-pane.js').ReaderPane} pane */
  constructor(pane, mode) {
    this.pane = pane;
    this.mode = mode;
    this.scroller = pane.scroller;
    this.sheet = null;
    this.wheel = { accumulated: 0, locked: false };
    this.padding = PADDING_PX;
  }

  mount() {
    this.stage = el('div', { class: 'stage', style: { padding: `${PADDING_PX}px` } });
    // Clicking the empty area beside the page flips, like tapping a book's edge.
    this.stage.addEventListener('click', (e) => {
      if (e.target !== this.stage || !this.pane.linksEnabled()) return;
      const r = this.stage.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) this.previous();
      else this.next();
    });
    this.scroller.replaceChildren(this.stage);
    this.sheet = null;
    this.show(this.pane.currentPage, 0);
  }

  spread(page) {
    return spreadFor(page, this.mode, this.pane.book.numPages);
  }

  fitTarget(page) {
    const pages = this.spread(page);
    const sizes = pages.map((p) => this.pane.pageView(p).displaySize(1));
    const w = sizes.reduce((sum, s) => sum + s.w, 0);
    const h = Math.max(...sizes.map((s) => s.h));
    // A lone page in two-page mode (the cover) keeps the scale of full spreads.
    return { w: this.mode === 'two-page' && pages.length === 1 ? w * 2 : w, h };
  }

  /**
   * @param {number} page
   * @param {-1|0|1} direction  animation direction; 0 = no animation
   */
  show(page, direction) {
    const pages = this.spread(clamp(page, 1, this.pane.book.numPages));
    const sheet = el('div', { class: 'sheet' });
    for (const p of pages) {
      const pv = this.pane.pageView(p);
      pv.setScale(this.pane.scale);
      sheet.append(pv.el);
      pv.render();
    }
    const previous = this.sheet;
    this.sheet = sheet;
    if (previous && direction !== 0 && this.pane.animationsEnabled()) {
      this.#animate(previous, sheet, direction);
    } else {
      this.stage.replaceChildren(sheet);
    }
    this.scroller.scrollTop = 0;
    this.pane.reportPage(pages[0]);
    this.#releaseDistant(pages);
  }

  // Forward: the old sheet turns away on top of the new one.
  // Backward: the new sheet turns in on top of the old one.
  #animate(previous, next, direction) {
    const kind = this.mode === 'two-page' ? 'slide' : 'turn';
    if (direction > 0) {
      previous.classList.add(`${kind}-out`);
      this.stage.prepend(next);
    } else {
      next.classList.add(`${kind}-in`);
      this.stage.append(next);
    }
    setTimeout(() => previous.remove(), TURN_DURATION_MS);
  }

  #releaseDistant(visible) {
    for (const [n, pv] of this.pane.pageViews) {
      if (pv.layersBuilt && !visible.includes(n) && Math.abs(n - visible[0]) > 3) pv.release();
    }
  }

  onScroll() {}

  isNear(pv) {
    return this.spread(this.pane.currentPage).includes(pv.pageNumber);
  }

  currentPosition() {
    return { page: this.pane.currentPage, x: 0, y: null };
  }

  scrollTo({ page, x, y }) {
    if (!this.sheet || !this.spread(this.pane.currentPage).includes(page)) this.show(page, 0);
    if (y == null) return;
    const pv = this.pane.pageView(page);
    const offset = pv.pdfToBoxOffset(x ?? 0, y);
    const top = pv.el.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top + this.scroller.scrollTop;
    this.scroller.scrollTop = top + offset.y - 40;
  }

  next() {
    const pages = this.spread(this.pane.currentPage);
    const following = pages[pages.length - 1] + 1;
    if (following <= this.pane.book.numPages) this.show(following, 1);
  }

  previous() {
    const first = this.spread(this.pane.currentPage)[0];
    if (first > 1) this.show(this.spread(first - 1)[0], -1);
  }

  /**
   * Turns wheel / swipe gestures into page flips when the page can't scroll
   * further in that direction. @returns {boolean} true if the event was consumed
   */
  onWheel(event) {
    const s = this.scroller;
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX : event.deltaY;
    const canScroll = s.scrollHeight > s.clientHeight + 2;
    const atBottom = s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
    const atTop = s.scrollTop <= 0;
    if (!horizontal && canScroll && !(delta > 0 && atBottom) && !(delta < 0 && atTop)) return false;

    this.wheel.accumulated += delta;
    if (!this.wheel.locked && Math.abs(this.wheel.accumulated) > WHEEL_THRESHOLD) {
      if (this.wheel.accumulated > 0) this.next();
      else this.previous();
      this.wheel.locked = true;
      setTimeout(() => Object.assign(this.wheel, { locked: false, accumulated: 0 }), WHEEL_COOLDOWN_MS);
    }
    return true;
  }
}
