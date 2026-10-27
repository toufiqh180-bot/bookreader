/**
 * Page-by-page reading: one page ('single') or a book spread ('two-page').
 *
 * Next/previous play a page turn (see page-turn.ts). The trackpad either pans
 * a zoomed page or turns it, decided by WheelGesture (lib/wheel-gesture.ts).
 *
 * Spreads pair pages like a printed book: the cover alone, then [2,3],
 * [4,5]… When two-page scans are split, a scan's two halves always pair with
 * each other (that *is* the original spread), and unsplit pages such as the
 * cover stand alone.
 */
import { el } from '../dom.ts';
import { clamp } from '../../lib/util.ts';
import { WheelGesture, scrollStateOf } from '../../lib/wheel-gesture.ts';
import { insetPadding } from './insets.ts';
import { startTurn, type Turn } from './page-turn.ts';
import type { Layout, LayoutHost, SlotTarget } from './layout.ts';
import type { PageView } from '../page-view.ts';
import { spreadSlots } from '../../lib/page-slots.ts';

/** Max time to wait for the next pages to render before animating anyway. */
const RENDER_WAIT_MS = 350;

export class PagedLayout implements Layout {
  readonly #host: LayoutHost;
  readonly #mode: 'single' | 'two-page';
  readonly #wheel = new WheelGesture();
  #stage!: HTMLDivElement;
  #sheet: HTMLDivElement | null = null;
  #turn: Turn | null = null;
  #showToken = 0;

  constructor(host: LayoutHost, mode: 'single' | 'two-page') {
    this.#host = host;
    this.#mode = mode;
  }

  mount(): void {
    this.#stage = el('div', { class: 'stage' });
    this.#stage.style.padding = insetPadding();
    // Tapping the empty area beside the page turns it, like tapping a book's edge.
    this.#stage.addEventListener('click', (e) => {
      if (e.target !== this.#stage || !this.#host.linksEnabled()) return;
      const r = this.#stage.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) this.previous();
      else this.next();
    });
    this.#host.scroller.replaceChildren(this.#stage);
    this.#sheet = null;
    this.show(this.#host.currentSlot, 0);
  }

  spread(slot: number): number[] {
    return spreadSlots(slot, this.#mode, this.#host.slots);
  }

  fitTarget(slot: number): { w: number; h: number } {
    const slots = this.spread(slot);
    const sizes = slots.map((s) => this.#host.pageView(s).displaySize(1));
    const w = sizes.reduce((sum, s) => sum + s.w, 0);
    const h = Math.max(...sizes.map((s) => s.h));
    // A lone page in two-page mode (the cover) keeps the scale of full spreads.
    return { w: this.#mode === 'two-page' && slots.length === 1 ? w * 2 : w, h };
  }

  /** Shows the spread containing `slot`, turning the page in `direction`. */
  show(slot: number, direction: -1 | 0 | 1): void {
    this.#turn?.finish(); // rapid presses: complete the running turn first
    const slots = this.spread(clamp(slot, 1, this.#host.slotCount));
    const views = slots.map((s) => this.#host.pageView(s));
    const sheet = el('div', { class: 'sheet' });
    for (const view of views) {
      view.setScale(this.#host.scale);
      sheet.append(view.el);
      void view.render();
    }
    const previous = this.#sheet;
    const previousViews = previous
      ? [...previous.querySelectorAll<HTMLElement & { pageView?: PageView }>('.page')].map((n) => n.pageView!).filter(Boolean)
      : [];
    this.#sheet = sheet;
    this.#host.reportSlot(slots[0]);
    this.#host.scroller.scrollTo({ top: 0, left: 0 });

    const style = this.#host.pageTransition();
    if (!previous || direction === 0 || style === 'none') {
      this.#stage.replaceChildren(sheet);
      this.#releaseDistant(slots);
      this.#prefetchNeighbours(slots);
      return;
    }
    // New sheet underneath, old one on top; wait briefly for the new pages to paint.
    this.#stage.prepend(sheet);
    const token = ++this.#showToken;
    const ready = Promise.race([Promise.all(views.map((v) => v.render())), new Promise((r) => setTimeout(r, RENDER_WAIT_MS))]);
    void ready.then(() => {
      if (token !== this.#showToken) {
        previous.remove();
        return;
      }
      this.#turn = startTurn({ stage: this.#stage, from: previous, to: sheet, fromViews: previousViews, toViews: views, direction, style });
      void this.#turn.finished.then(() => {
        if (this.#turn && token === this.#showToken) this.#turn = null;
        this.#releaseDistant(slots);
        this.#prefetchNeighbours(slots);
      });
    });
  }

  /**
   * Renders the spreads on either side ahead of time, so a page turn shows
   * real content on the back of the leaf instead of blank paper.
   */
  #prefetchNeighbours(visible: number[]): void {
    const before = visible[0] - 1;
    const after = visible[visible.length - 1] + 1;
    const neighbours = [...(before >= 1 ? this.spread(before) : []), ...(after <= this.#host.slotCount ? this.spread(after) : [])];
    for (const slot of neighbours) {
      const view = this.#host.pageView(slot);
      view.setScale(this.#host.scale);
      void view.render();
    }
  }

  #releaseDistant(visible: number[]): void {
    this.#host.forEachView((view) => {
      if (view.layersBuilt && !visible.includes(view.slot.index) && Math.abs(view.slot.index - visible[0]) > 4) view.release();
    });
  }

  onScroll(): void {}

  isNear(view: PageView): boolean {
    return this.spread(this.#host.currentSlot).includes(view.slot.index);
  }

  currentTarget() {
    return { slot: this.#host.currentSlot, x: null, y: null };
  }

  scrollTo({ slot, x, y }: SlotTarget): void {
    if (!this.#sheet || !this.spread(this.#host.currentSlot).includes(slot)) this.show(slot, 0);
    if (y == null) return;
    const view = this.#host.pageView(slot);
    const offset = view.pdfToBoxOffset(x ?? 0, y);
    const scroller = this.#host.scroller;
    const top = view.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = top + offset.y - 40;
  }

  next(): void {
    const slots = this.spread(this.#host.currentSlot);
    const following = slots[slots.length - 1] + 1;
    if (following <= this.#host.slotCount) this.show(following, 1);
  }

  previous(): void {
    const first = this.spread(this.#host.currentSlot)[0];
    if (first > 1) this.show(this.spread(first - 1)[0], -1);
  }

  onWheel(event: WheelEvent): boolean {
    const decision = this.#wheel.handle(event.deltaX, event.deltaY, scrollStateOf(this.#host.scroller), event.timeStamp);
    if (decision.turn > 0) this.next();
    else if (decision.turn < 0) this.previous();
    return decision.consume;
  }
}
