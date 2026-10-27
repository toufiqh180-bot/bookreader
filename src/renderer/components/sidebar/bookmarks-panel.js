/** Bookmarks list: jump, rename (double-click), remove. */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';

export class BookmarksPanel {
  constructor({ book, pane, app }) {
    this.book = book;
    this.pane = pane;
    this.toggleButton = el('button', { class: 'primary-btn wide', onclick: () => app.commands.run('nav.toggleBookmark') });
    this.list = el('div', { class: 'bookmark-list' });
    this.el = el('div', { class: 'bookmarks-panel' }, [el('div', { class: 'panel-head' }, [this.toggleButton]), this.list]);
    this.unsubscribe = book.bookmarks.on('change', () => {
      this.#render();
      this.onPageChange(this.pane().currentPage);
    });
    this.#render();
  }

  onPageChange(page) {
    const verb = this.book.bookmarks.has(page) ? 'Remove bookmark from' : 'Bookmark';
    this.toggleButton.innerHTML = `${icon('bookmark', 15)} ${verb} page ${this.book.pageLabel(page)}`;
  }

  #render() {
    const { items } = this.book.bookmarks;
    if (!items.length) {
      this.list.replaceChildren(el('div', { class: 'empty', html: 'No bookmarks yet. Press <kbd>⌘/Ctrl</kbd> <kbd>D</kbd> to bookmark the current page.' }));
      return;
    }
    this.list.replaceChildren(...items.map((b) => this.#row(b)));
  }

  #row(bookmark) {
    const title = el('span', { class: 'bm-title', text: bookmark.title, title: 'Double-click to rename' });
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.#rename(title, bookmark);
    });
    return el('div', { class: 'bm-row', onclick: () => this.pane().navigate({ page: bookmark.page }) }, [
      el('span', { class: 'bm-icon', html: icon('bookmark', 14) }),
      title,
      el('span', { class: 'muted', text: this.book.pageLabel(bookmark.page) }),
      el('button', {
        class: 'icon-btn small',
        title: 'Remove bookmark',
        html: icon('x', 14),
        onclick: (e) => {
          e.stopPropagation();
          this.book.bookmarks.remove(bookmark.id);
        },
      }),
    ]);
  }

  #rename(titleEl, bookmark) {
    titleEl.contentEditable = 'true';
    titleEl.focus();
    document.getSelection().selectAllChildren(titleEl);
    const finish = () => {
      titleEl.contentEditable = 'false';
      this.book.bookmarks.rename(bookmark.id, titleEl.textContent);
    };
    titleEl.addEventListener('blur', finish, { once: true });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      }
    });
  }

  destroy() {
    this.unsubscribe();
  }
}
