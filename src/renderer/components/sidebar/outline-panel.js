/** Table of contents from the PDF outline, with the current section highlighted. */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';

const INDENT_PX = 14;
const EXPANDED_DEPTH = 1; // top-level chapters start expanded

export class OutlinePanel {
  constructor({ book, pane }) {
    this.book = book;
    this.pane = pane;
    this.el = el('div', { class: 'outline' });
    /** Page-number lookups in flight; the current section is marked once all resolve. */
    this.resolving = [];
    if (book.doc.outline.length) {
      this.el.append(this.#list(book.doc.outline, 0));
      Promise.all(this.resolving).then(() => this.onPageChange(this.pane().currentPage));
    } else {
      this.el.append(el('div', { class: 'empty', html: 'This PDF has no table of contents.<br>Use <b>Pages</b> or <b>Bookmarks</b> to get around.' }));
    }
  }

  onPageChange(page) {
    let current = null;
    for (const row of this.el.querySelectorAll('.outline-item[data-page]')) {
      row.classList.remove('current');
      if (Number(row.dataset.page) <= page) current = row;
    }
    current?.classList.add('current');
  }

  #list(items, depth) {
    const list = el('div', { class: 'outline-list' });
    for (const item of items) {
      const children = item.items?.length ? this.#list(item.items, depth + 1) : null;
      const pageNumber = el('span', { class: 'outline-page' });
      const toggle = el('button', {
        class: `outline-toggle${children ? '' : ' leaf'}`,
        html: children ? icon('chevron', 12) : '',
        'aria-label': children ? 'Expand section' : null,
      });
      const row = el('div', { class: 'outline-item', style: { paddingLeft: `${10 + depth * INDENT_PX}px` } }, [
        toggle,
        el('span', { class: 'outline-label', text: item.title }),
        pageNumber,
      ]);

      if (children) {
        const setOpen = (open) => {
          children.hidden = !open;
          toggle.classList.toggle('open', open);
        };
        setOpen(depth < EXPANDED_DEPTH);
        toggle.onclick = (e) => {
          e.stopPropagation();
          setOpen(children.hidden);
        };
      }
      if (item.dest) {
        row.onclick = () => this.pane().followDestination(item.dest);
        // Resolve page numbers lazily; large outlines would otherwise block.
        const lookup = this.book.doc
          .resolveDestination(item.dest)
          .then((target) => {
            if (!target) return;
            row.dataset.page = target.page;
            pageNumber.textContent = this.book.pageLabel(target.page);
          })
          .catch(() => {});
        this.resolving.push(lookup);
      } else if (item.url) {
        row.onclick = () => window.open(item.url, '_blank');
      }
      list.append(row);
      if (children) list.append(children);
    }
    return list;
  }
}
