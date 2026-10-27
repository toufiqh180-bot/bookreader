/**
 * Full-text search over a book (native text plus OCR text), producing
 * results with snippets and on-page hit rectangles.
 *
 * Events:
 *   'progress' (pagesSearched, totalPages, resultCount)
 *   'results'  — search finished or was cleared
 *   'current'  (index) — the highlighted result changed
 *
 * @typedef {object} SearchResult
 * @property {number} page
 * @property {import('../lib/geometry.js').PdfRect[]} rects
 * @property {string} snippet
 * @property {number} matchStart  offset of the match within `snippet`
 * @property {number} matchLength
 */
import { rectsForRange } from '../lib/page-text.js';
import { Emitter, yieldToUi } from '../lib/util.js';

const MIN_QUERY_LENGTH = 2;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;
const PAGES_PER_YIELD = 20;

export class BookSearch extends Emitter {
  /** @param {import('../models/book.js').Book} book */
  constructor(book) {
    super();
    this.book = book;
    this.query = '';
    this.matchCase = false;
    /** @type {SearchResult[]} */
    this.results = [];
    this.current = -1;
    this.generation = 0;
  }

  /** Hit rectangles on `page`, flagged when they belong to the current result. */
  hitsOn(page) {
    const currentResult = this.results[this.current];
    return this.results.filter((r) => r.page === page).flatMap((r) => r.rects.map((rect) => ({ rect, current: r === currentResult })));
  }

  async run(query, { matchCase = this.matchCase } = {}) {
    const generation = ++this.generation;
    Object.assign(this, { query, matchCase, results: [], current: -1 });
    this.emit('results');
    const needle = matchCase ? query.trim() : query.trim().toLowerCase();
    if (needle.length < MIN_QUERY_LENGTH) return;

    for (let page = 1; page <= this.book.numPages; page++) {
      if (generation !== this.generation) return; // superseded by a newer query
      const text = await this.book.readableText(page);
      // Treat line breaks as spaces so phrases spanning lines still match.
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
    this.emit('results');
  }

  clear() {
    return this.run('');
  }

  /** @returns {SearchResult|null} */
  select(index) {
    if (!this.results.length) return null;
    this.current = (index + this.results.length) % this.results.length;
    this.emit('current', this.current);
    return this.results[this.current];
  }

  step(delta) {
    return this.select(this.current < 0 && delta < 0 ? -1 : this.current + delta);
  }
}
