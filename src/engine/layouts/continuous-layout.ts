/**
 * Continuous vertical scrolling. Every slot gets a placeholder of the right
 * size in one column; only slots near the viewport are rendered, and distant
 * ones are released so 1000-page books stay light on memory.
 */
import { el } from '../dom.ts';
import { insetPadding, PAGE_INSETS } from './insets.ts';
import type { Layout, LayoutHost, SlotTarget } from './layout.ts';
import type { PageView } from '../page-view.ts';

const PAGE_GAP_PX = 20;
const RENDER_AHEAD = 2; // slots beyond the viewport to pre-render
const RELEASE_BEYOND = 10; // slots beyond the viewport before releasing

export class ContinuousLayout implements Layout {
  readonly #host: LayoutHost;
  #views: PageView[] = [];

  constructor(host: LayoutHost) {
    this.#host = host;
  }

  mount(scale: number): void {
    const column = el('div', { class: 'column' });
    Object.assign(column.style, { gap: `${PAGE_GAP_PX}px`, padding: insetPadding() });
    this.#views = [];
    for (let slot = 1; slot <= this.#host.slotCount; slot++) {
      const view = this.#host.pageView(slot);
      view.setScale(scale);
      column.append(view.el);
      this.#views.push(view);
    }
    this.#host.scroller.replaceChildren(column);
  }

  fitTarget(slot: number): { w: number; h: number } {
    return this.#host.pageView(slot).displaySize(1);
  }

  onScroll(): void {
    const { scrollTop, clientHeight } = this.#host.scroller;
    const first = this.#indexAt(scrollTop);
    const last = this.#indexAt(scrollTop + clientHeight);
    // The current slot is the one crossing a third of the way down.
    this.#host.reportSlot(this.#indexAt(scrollTop + clientHeight / 3) + 1);
    for (let i = Math.max(0, first - RENDER_AHEAD); i <= Math.min(this.#views.length - 1, last + RENDER_AHEAD); i++) {
      void this.#views[i].render();
    }
    for (const [i, view] of this.#views.entries()) {
      if (view.layersBuilt && (i < first - RELEASE_BEYOND || i > last + RELEASE_BEYOND)) view.release();
    }
  }

  isNear(view: PageView): boolean {
    return Math.abs(view.slot.index - this.#host.currentSlot) <= RENDER_AHEAD + 3;
  }

  currentTarget() {
    const scroller = this.#host.scroller;
    const view = this.#views[this.#indexAt(scroller.scrollTop + 1)];
    const viewport = scroller.getBoundingClientRect();
    const box = view.el.getBoundingClientRect();
    const [x, y] = view.clientToPdf(Math.max(box.left, viewport.left), Math.max(box.top, viewport.top));
    return { slot: view.slot.index, x, y };
  }

  scrollTo({ slot, x, y }: SlotTarget): void {
    const scroller = this.#host.scroller;
    const view = this.#host.pageView(slot);
    const hasPoint = y != null;
    const offset = hasPoint ? view.pdfToBoxOffset(x ?? 0, y) : { x: 0, y: 0 };
    const viewport = scroller.getBoundingClientRect();
    const box = view.el.getBoundingClientRect();
    // Leave a little headroom above a target point so it isn't flush with the edge.
    const top = scroller.scrollTop + (box.top - viewport.top) + offset.y - (hasPoint ? 40 : PAGE_INSETS.top / 2);
    const wide = scroller.scrollWidth > scroller.clientWidth;
    const left = wide ? scroller.scrollLeft + (box.left - viewport.left) + offset.x - 40 : 0;
    scroller.scrollTo({ top, left });
    this.#host.reportSlot(slot);
    this.onScroll();
  }

  next(): void {
    this.#host.scroller.scrollBy({ top: this.#host.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  previous(): void {
    this.#host.scroller.scrollBy({ top: -this.#host.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  /** The browser scrolls natively in this layout. */
  onWheel(): boolean {
    return false;
  }

  /** Binary search: index of the first slot whose bottom edge is below `y`. */
  #indexAt(y: number): number {
    let lo = 0;
    let hi = this.#views.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const node = this.#views[mid].el;
      if (node.offsetTop + node.offsetHeight < y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
