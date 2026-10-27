/**
 * The contract between a ReaderPane and the strategy that arranges its pages
 * (continuous scrolling or page-by-page). Layouts work in slot indices
 * (see lib/page-slots.ts); the pane translates to and from PDF pages.
 */
import type { PageView } from '../page-view.ts';
import type { PageTransition } from './page-turn.ts';
import type { PageSlot } from '../../lib/page-slots.ts';

/** A place inside a slot: optional PDF coordinates on its page. */
export interface SlotTarget {
  slot: number;
  x?: number | null;
  y?: number | null;
}

/** What layouts need from the pane. */
export interface LayoutHost {
  readonly scroller: HTMLElement;
  readonly slotCount: number;
  readonly slots: PageSlot[];
  readonly scale: number;
  readonly currentSlot: number;
  pageView(slot: number): PageView;
  forEachView(fn: (view: PageView) => void): void;
  reportSlot(slot: number): void;
  linksEnabled(): boolean;
  pageTransition(): PageTransition;
}

export interface Layout {
  mount(scale: number): void;
  /** Unscaled size the zoom presets should fit for the given slot. */
  fitTarget(slot: number): { w: number; h: number };
  onScroll(): void;
  isNear(view: PageView): boolean;
  /** Slot and PDF point at the top-left of the viewport. */
  currentTarget(): SlotTarget & { x: number | null; y: number | null };
  scrollTo(target: SlotTarget): void;
  next(): void;
  previous(): void;
  /** @returns true when the layout consumed the wheel event */
  onWheel(event: WheelEvent): boolean;
}
