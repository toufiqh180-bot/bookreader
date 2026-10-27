/**
 * Search UI over a BookSearch. Enter / Shift+Enter step through results; the
 * first jump goes into history so Back returns to where you were reading,
 * while stepping between hits does not flood the history.
 */
import { el } from '../common/dom.js';
import { escapeHtml } from '../../lib/util.js';

const MAX_RENDERED_RESULTS = 2000;
const INPUT_DEBOUNCE_MS = 250;

export class SearchPanel {
  constructor({ pane, app, book }) {
    this.pane = pane;
    this.search = app.searchFor(book);
    this.jumpedSinceQuery = false;

    this.input = el('input', { type: 'search', placeholder: 'Search this book…', value: this.search.query, 'aria-label': 'Search' });
    const matchCase = el('input', { type: 'checkbox', checked: this.search.matchCase });
    this.status = el('div', { class: 'search-status muted' });
    this.list = el('div', { class: 'search-results' });
    this.el = el('div', { class: 'search-panel' }, [
      el('div', { class: 'panel-head col' }, [this.input, el('label', { class: 'check' }, [matchCase, ' Match case'])]),
      this.status,
      this.list,
    ]);

    let timer;
    this.input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.#run(), INPUT_DEBOUNCE_MS);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.#goTo(this.search.step(e.shiftKey ? -1 : 1));
      if (e.key === 'Escape') {
        this.input.value = '';
        this.#run();
      }
    });
    matchCase.addEventListener('change', () => this.#run({ matchCase: matchCase.checked }));

    this.unsubscribe = [
      this.search.on('progress', (done, total, found) => (this.status.textContent = `Searching… page ${done} of ${total} · ${found} found`)),
      this.search.on('results', () => this.#renderResults()),
      this.search.on('current', (index) => this.#markCurrent(index)),
    ];
    this.#renderResults();
  }

  onShow() {
    this.input.focus();
    this.input.select();
  }

  /** Pre-fills and runs a query (from the selection bar). */
  setQuery(text) {
    this.input.value = text;
    this.#run();
  }

  #run(options) {
    this.jumpedSinceQuery = false;
    this.search.run(this.input.value, options);
  }

  #goTo(result) {
    if (!result) return;
    const pane = this.pane();
    const first = result.rects[0];
    const target = first ? { page: result.page, x: Math.min(first.x1, first.x2), y: Math.max(first.y1, first.y2) + 60 } : { page: result.page };
    if (this.jumpedSinceQuery) pane.scrollTo(target);
    else pane.navigate(target);
    this.jumpedSinceQuery = true;
    pane.flash(result.page, result.rects);
  }

  #renderResults() {
    const { results, query } = this.search;
    if (!query.trim()) this.status.textContent = '';
    else this.status.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No results';

    const fragment = document.createDocumentFragment();
    let lastPage = null;
    results.slice(0, MAX_RENDERED_RESULTS).forEach((r, index) => {
      if (r.page !== lastPage) {
        lastPage = r.page;
        fragment.append(el('div', { class: 'result-page', text: `Page ${this.pane().book.pageLabel(r.page)}` }));
      }
      const before = escapeHtml(r.snippet.slice(0, r.matchStart));
      const match = escapeHtml(r.snippet.slice(r.matchStart, r.matchStart + r.matchLength));
      const after = escapeHtml(r.snippet.slice(r.matchStart + r.matchLength));
      fragment.append(
        el('button', {
          class: 'result',
          dataset: { index },
          html: `${before}<mark>${match}</mark>${after}`,
          onclick: () => this.#goTo(this.search.select(index)),
        }),
      );
    });
    this.list.replaceChildren(fragment);
    this.#markCurrent(this.search.current);
  }

  #markCurrent(index) {
    this.list.querySelector('.result.current')?.classList.remove('current');
    const node = this.list.querySelector(`.result[data-index="${index}"]`);
    node?.classList.add('current');
    node?.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.unsubscribe.forEach((off) => off());
  }
}
