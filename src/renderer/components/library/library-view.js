/**
 * Home screen: recently read books with covers and progress, an Open button
 * and a drop zone. Shown when no tab is active.
 */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';

export class LibraryView {
  /**
   * @param {HTMLElement} root
   * @param {{ onOpenPath: (path: string) => void, onBrowse: () => void, onRemove: (bookId: string) => void }} handlers
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
  }

  async render() {
    const books = await window.api.listLibrary();
    const { onBrowse } = this.handlers;
    const header = el('header', { class: 'library-head' }, [
      el('div', {}, [el('h1', { text: 'Library' }), el('p', { class: 'muted', text: 'Your books, notes and reading positions — stored on this computer.' })]),
      el('button', { class: 'primary-btn', html: `${icon('folder', 16)} Open PDF…`, onclick: onBrowse }),
    ]);
    const content = books.length
      ? el(
          'div',
          { class: 'library-grid' },
          books.map((b) => this.#card(b)),
        )
      : el('div', { class: 'library-empty' }, [
          el('div', {
            class: 'drop-hint',
            html: `${icon('spread', 40)}<h2>Drop a PDF here to start reading</h2><p class="muted">or press <kbd>⌘/Ctrl</kbd> <kbd>O</kbd></p>`,
          }),
        ]);
    this.root.replaceChildren(el('div', { class: 'library' }, [header, content]));
  }

  #card(book) {
    const progress = book.pageCount ? Math.round(((book.lastPage - 1) / Math.max(1, book.pageCount - 1)) * 100) : 0;
    const cover = book.cover ? el('img', { src: book.cover, alt: '' }) : el('div', { class: 'cover-placeholder', html: icon('page', 32) });
    const card = el('div', { class: `book-card${book.exists ? '' : ' missing'}`, title: book.filePath ?? '' }, [
      el('div', { class: 'cover' }, [cover]),
      el('div', { class: 'book-title', text: book.fileName.replace(/\.pdf$/i, '') }),
      el('div', { class: 'book-meta muted', text: book.exists ? `${progress}% · ${book.annotationCount} notes` : 'File not found' }),
      el('div', { class: 'book-progress' }, [el('div', { style: { width: `${progress}%` } })]),
      el('button', {
        class: 'icon-btn small remove',
        title: 'Remove from library (deletes its notes)',
        html: icon('x', 14),
        onclick: (e) => {
          e.stopPropagation();
          this.handlers.onRemove(book.bookId);
        },
      }),
    ]);
    if (book.exists) card.addEventListener('click', () => this.handlers.onOpenPath(book.filePath));
    return card;
  }
}
