/**
 * Browser-style navigation history for a book.
 *
 * The stack holds reading positions; the entry at `pointer` is always "where
 * the reader is now". A jump (link, TOC, search, …) truncates any forward
 * entries, records the departure point, and pushes the destination — exactly
 * how a web browser treats clicking a link after pressing Back.
 *
 * Pure data structure: no DOM, no I/O. Serialises to the `navigationStack` /
 * `stackPointer` fields of the unified book schema.
 *
 * @typedef {{ page: number, x: number, y: number, timestamp: string }} HistoryEntry
 * @typedef {{ page: number, x?: number|null, y?: number|null }} Position
 */

const DEFAULT_LIMIT = 200;

export class NavigationHistory {
  /**
   * @param {{ stack?: HistoryEntry[], pointer?: number, limit?: number, now?: () => string }} [options]
   */
  constructor({ stack = [], pointer = stack.length - 1, limit = DEFAULT_LIMIT, now = () => new Date().toISOString() } = {}) {
    /** @type {HistoryEntry[]} */
    this.stack = stack.map((e) => ({ ...e }));
    this.pointer = Math.min(Math.max(pointer, -1), this.stack.length - 1);
    this.limit = limit;
    this.now = now;
  }

  get canGoBack() {
    return this.pointer > 0;
  }

  get canGoForward() {
    return this.pointer < this.stack.length - 1;
  }

  /**
   * Records a jump from `from` to `to`.
   * @param {Position} from
   * @param {Position} to
   */
  push(from, to) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    if (this.stack.length) this.stack[this.stack.length - 1] = this.#entry(from);
    else this.stack.push(this.#entry(from));
    this.stack.push(this.#entry(to));
    if (this.stack.length > this.limit) this.stack = this.stack.slice(-this.limit);
    this.pointer = this.stack.length - 1;
  }

  /**
   * Moves the pointer by `delta` (−1 = back, +1 = forward). The current
   * position is saved first so returning later restores the exact spot.
   * @param {Position} current
   * @param {number} delta
   * @returns {HistoryEntry|null} the entry to navigate to, or null at either end
   */
  step(current, delta) {
    const target = this.pointer + delta;
    if (target < 0 || target >= this.stack.length) return null;
    this.stack[this.pointer] = this.#entry(current);
    this.pointer = target;
    return { ...this.stack[target] };
  }

  /** @returns {{ navigationStack: HistoryEntry[], stackPointer: number }} */
  toJSON() {
    return { navigationStack: this.stack.map((e) => ({ ...e })), stackPointer: this.pointer };
  }

  /** @param {Position} p */
  #entry(p) {
    return { page: p.page, x: Math.round(p.x ?? 0), y: Math.round(p.y ?? 0), timestamp: this.now() };
  }
}
