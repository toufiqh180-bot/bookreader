/**
 * Full-text search over a book (native text plus OCR text), producing results
 * with snippets and on-page hit rectangles.
 *
 * Events: `progress(done, total, found)`, `results` (finished or cleared),
 * `current(index)` (the highlighted result changed).
 */
import { rectsForRange } from '../lib/page-text.ts';
import { Emitter, yieldToUi } from '../lib/util.ts';
import type { Book } from '../models/book.ts';
import type { PdfRect } from '../models/types.ts';

export interface SearchResult {
  page: number;
  rects: PdfRect[];
  snippet: string;
  /** Offset of the match within `snippet`. */
  matchStart: number;
  matchLength: number;
}

const MIN_QUERY_LENGTH = 2;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;
const PAGES_PER_YIELD = 20;

export class BookSearch extends Emitter<{ progress: [done: number, total: number, found: number]; results: []; current: [index: number] }> {
  readonly book: Book;
  query = '';
  matchCase = false;
  results: SearchResult[] = [];
  current = -1;
  searching = false;
  #generation = 0;

  constructor(book: Book) {
    super();
    this.book = book;
  }

  /** Hit rectangles on `page`, flagged when they belong to the current result. */
  hitsOn(page: number): Array<{ rect: PdfRect; current: boolean }> {
    const currentResult = this.results[this.current];
    return this.results.filter((r) => r.page === page).flatMap((r) => r.rects.map((rect) => ({ rect, current: r === currentResult })));
  }

  async run(query: string, { matchCase = this.matchCase } = {}): Promise<void> {
    const generation = ++this.#generation;
    Object.assign(this, { query, matchCase, results: [], current: -1, searching: true });
    this.emit('results');
    const needle = matchCase ? query.trim() : query.trim().toLowerCase();
    if (needle.length < MIN_QUERY_LENGTH) {
      this.searching = false;
      this.emit('results');
      return;
    }
    for (let page = 1; page <= this.book.numPages; page++) {
      if (generation !== this.#generation) return; // superseded by a newer query
      const text = await this.book.readableText(page);
      // Line breaks match as spaces so phrases spanning lines are found.
      const haystack = (matchCase ? text.str : text.str.toLowerCase()).replace(/\n/g, ' ');
      for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) {
        const from = Math.max(0, i - SNIPPET_BEFORE);
        this.results.push({
          page,
          rects: rectsForRange(text, i, i + needle.length),
          snippet: text.str.slice(from, i + needle.length + SNIPPET_AFTER).replace(/\s+/g, ' '),
          matchStart: i - from,
          matchLength: needle.length,
        });
      }
      if (page % PAGES_PER_YIELD === 0) {
        this.emit('progress', page, this.book.numPages, this.results.length);
        await yieldToUi();
      }
    }
    this.searching = false;
    this.emit('results');
  }

  clear(): Promise<void> {
    return this.run('');
  }

  select(index: number): SearchResult | null {
    if (!this.results.length) return null;
    this.current = (index + this.results.length) % this.results.length;
    this.emit('current', this.current);
    return this.results[this.current];
  }

  step(delta: number): SearchResult | null {
    return this.select(this.current < 0 && delta < 0 ? -1 : this.current + delta);
  }
}
