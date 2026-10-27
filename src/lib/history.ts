/**
 * Browser-style navigation history for a book.
 *
 * The stack holds reading positions; the entry at `pointer` is always "where
 * the reader is now". A jump (link, contents, search…) drops any forward
 * entries, records the departure point and pushes the destination — exactly
 * how a web browser treats following a link after pressing Back.
 *
 * Pure data structure. Serialises to `navigationStack` / `stackPointer`.
 */
import type { HistoryEntry, Position } from '../models/types.ts';

const DEFAULT_LIMIT = 200;

interface Options {
  stack?: HistoryEntry[];
  pointer?: number;
  limit?: number;
  now?: () => string;
}

export class NavigationHistory {
  stack: HistoryEntry[];
  pointer: number;
  readonly limit: number;
  readonly now: () => string;

  constructor({ stack = [], pointer = stack.length - 1, limit = DEFAULT_LIMIT, now = () => new Date().toISOString() }: Options = {}) {
    this.stack = stack.map((e) => ({ ...e }));
    this.pointer = Math.min(Math.max(pointer, -1), this.stack.length - 1);
    this.limit = limit;
    this.now = now;
  }

  get canGoBack(): boolean {
    return this.pointer > 0;
  }

  get canGoForward(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  /** Records a jump from `from` to `to`. */
  push(from: Position, to: Position): void {
    this.stack = this.stack.slice(0, this.pointer + 1);
    if (this.stack.length) this.stack[this.stack.length - 1] = this.#entry(from);
    else this.stack.push(this.#entry(from));
    this.stack.push(this.#entry(to));
    if (this.stack.length > this.limit) this.stack = this.stack.slice(-this.limit);
    this.pointer = this.stack.length - 1;
  }

  /**
   * Moves by `delta` (−1 back, +1 forward), saving the current position first
   * so returning restores the exact spot. Null at either end.
   */
  step(current: Position, delta: number): HistoryEntry | null {
    const target = this.pointer + delta;
    if (target < 0 || target >= this.stack.length) return null;
    this.stack[this.pointer] = this.#entry(current);
    this.pointer = target;
    return { ...this.stack[target] };
  }

  toJSON(): { navigationStack: HistoryEntry[]; stackPointer: number } {
    return { navigationStack: this.stack.map((e) => ({ ...e })), stackPointer: this.pointer };
  }

  #entry(p: Position): HistoryEntry {
    return { page: p.page, x: Math.round(p.x ?? 0), y: Math.round(p.y ?? 0), timestamp: this.now() };
  }
}
