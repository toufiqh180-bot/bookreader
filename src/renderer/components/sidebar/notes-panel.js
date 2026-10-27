/** All annotations in reading order, filterable, with export. */
import { el } from '../common/dom.js';
import { ANNOTATION_LABELS, inReadingOrder } from '../../lib/export-format.js';
import { toBox } from '../../lib/geometry.js';

const FILTERS = [['all', 'All annotations'], ['commented', 'With comments'], ...Object.entries(ANNOTATION_LABELS)];

export class NotesPanel {
  constructor({ book, pane, app }) {
    this.book = book;
    this.pane = pane;
    this.app = app;
    this.filter = 'all';
    this.list = el('div', { class: 'note-list' });
    const filterSelect = el(
      'select',
      { class: 'small-select', 'aria-label': 'Filter annotations', onchange: (e) => ((this.filter = e.target.value), this.#render()) },
      FILTERS.map(([value, label]) => el('option', { value, text: label })),
    );
    const exportButton = el('button', { class: 'text-btn', text: 'Export…', onclick: (e) => app.showExportMenu(e.currentTarget) });
    this.el = el('div', { class: 'notes-panel' }, [
      el('div', { class: 'panel-head' }, [filterSelect, el('span', { class: 'spacer' }), exportButton]),
      this.list,
    ]);
    this.unsubscribe = book.annotations.on('change', () => this.#render());
    this.#render();
  }

  #matches(a) {
    return this.filter === 'all' || a.type === this.filter || (this.filter === 'commented' && a.comment);
  }

  #render() {
    const items = inReadingOrder(this.book.annotations.items).filter((a) => this.#matches(a));
    if (!items.length) {
      this.list.replaceChildren(
        el('div', {
          class: 'empty',
          html: 'No annotations yet.<br><br>Select text and press <kbd>H</kbd> to highlight or <kbd>N</kbd> to add a note. The pen tools draw in the margins.',
        }),
      );
      return;
    }
    this.list.replaceChildren(...items.map((a) => this.#card(a)));
  }

  #card(a) {
    return el('button', { class: 'note-card', onclick: () => this.#reveal(a) }, [
      el('div', { class: 'note-meta' }, [
        el('span', { class: 'chip', style: { background: a.color } }),
        el('span', { text: ANNOTATION_LABELS[a.type] }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'muted', text: `p. ${this.book.pageLabel(a.page)}` }),
      ]),
      a.textQuoted ? el('div', { class: 'note-quote', text: a.textQuoted }) : null,
      a.comment ? el('div', { class: 'note-comment', text: a.comment }) : null,
    ]);
  }

  #reveal(a) {
    const pane = this.pane();
    const first = a.rects?.[0] ? toBox(a.rects[0]) : null;
    const target = first ? { page: a.page, x: first.x, y: first.y + first.h + 30 } : { page: a.page };
    pane.navigate(target, { flash: a.rects });
    setTimeout(() => this.app.annotationEditor.open(pane, a.id), 250);
  }

  destroy() {
    this.unsubscribe();
  }
}
