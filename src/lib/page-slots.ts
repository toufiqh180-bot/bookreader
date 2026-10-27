/**
 * Page slots: the pages the reader actually shows, which may differ from the
 * PDF's pages.
 *
 * Scanned books are often photographed as open spreads, so one PDF page holds
 * two book pages side by side. With splitting on, each landscape PDF page
 * becomes two slots — its left and right halves — while portrait pages
 * (covers, inserts) stay whole. Annotations and positions are still stored
 * against the PDF page in PDF coordinates; slots are only a view.
 *
 */
import type { PageSize } from '../models/types.ts';

export interface PageSlot {
  /** 1-based position in reading order. */
  index: number;
  /** PDF page shown. */
  pageNumber: number;
  /** Left and right edges, as fractions of the page width. */
  x0: number;
  x1: number;
}

/** Wider than this aspect ratio counts as a two-page spread. */
export const SPREAD_ASPECT = 1.2;
/** Share of interior pages that must be spreads before we suggest splitting. */
const SPREAD_SCAN_THRESHOLD = 0.6;

export const isSpread = ({ w, h }: PageSize): boolean => w / h > SPREAD_ASPECT;

/**
 * True when most interior pages are landscape spreads — the signature of a
 * book scanned open. The first and last pages are ignored (covers).
 */
export function looksLikeSpreadScan(sizes: PageSize[]): boolean {
  const interior = sizes.length > 4 ? sizes.slice(1, -1) : sizes;
  if (!interior.length) return false;
  return interior.filter(isSpread).length / interior.length >= SPREAD_SCAN_THRESHOLD;
}

/** @param sizes PDF page sizes, index = page − 1 */
export function buildSlots(sizes: PageSize[], split: boolean): PageSlot[] {
  const slots: PageSlot[] = [];
  sizes.forEach((size, i) => {
    const pageNumber = i + 1;
    if (split && isSpread(size)) {
      slots.push({ index: slots.length + 1, pageNumber, x0: 0, x1: 0.5 });
      slots.push({ index: slots.length + 1, pageNumber, x0: 0.5, x1: 1 });
    } else {
      slots.push({ index: slots.length + 1, pageNumber, x0: 0, x1: 1 });
    }
  });
  return slots;
}

/**
 * The slot showing a point on a PDF page. `xFraction` (0–1 across the page)
 * picks the half of a split page; without it, the first slot is returned.
 */
export function slotFor(slots: PageSlot[], pageNumber: number, xFraction: number | null = null): PageSlot {
  const matches = slots.filter((s) => s.pageNumber === pageNumber);
  if (!matches.length) return slots[Math.min(slots.length, Math.max(1, pageNumber)) - 1];
  if (xFraction == null) return matches[0];
  return matches.find((s) => xFraction >= s.x0 && xFraction < s.x1) ?? matches[matches.length - 1];
}

/**
 * Slot indices shown together with `slot` in a two-page spread.
 *
 * Normal books pair like print: the cover alone, then [2,3], [4,5]…
 * With split scans, a scan's two halves always pair with each other — that
 * is the original spread — and whole pages (covers, inserts) stand alone.
 */
export function spreadSlots(slot: number, mode: 'single' | 'two-page', slots: PageSlot[]): number[] {
  if (mode !== 'two-page') return [slot];
  const isHalf = (s: PageSlot) => s.x1 - s.x0 < 1;
  if (slots.some(isHalf)) {
    const current = slots[slot - 1];
    return isHalf(current) ? slots.filter((s) => s.pageNumber === current.pageNumber).map((s) => s.index) : [slot];
  }
  if (slot === 1) return [1];
  const left = slot % 2 === 0 ? slot : slot - 1;
  return left + 1 <= slots.length ? [left, left + 1] : [left];
}
