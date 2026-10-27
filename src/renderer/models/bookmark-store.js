/**
 * Owns a book's bookmarks, kept sorted by page.
 *
 * Events: 'change'
 *
 * @typedef {{ id: string, page: number, title: string, createdAt: string }} Bookmark
 */
import { Emitter, nowIso, uid } from '../lib/util.js';

export class BookmarkStore extends Emitter {
  /** @param {Bookmark[]} bookmarks  mutated in place (it is the persisted array) */
  constructor(bookmarks) {
    super();
    this.items = bookmarks;
  }

  has(page) {
    return this.items.some((b) => b.page === page);
  }

  add(page, title) {
    const bookmark = { id: uid('bmk'), page, title, createdAt: nowIso() };
    this.items.push(bookmark);
    this.items.sort((a, b) => a.page - b.page);
    this.emit('change');
    return bookmark;
  }

  rename(id, title) {
    const bookmark = this.items.find((b) => b.id === id);
    if (!bookmark || !title.trim()) return;
    bookmark.title = title.trim();
    this.emit('change');
  }

  remove(id) {
    const index = this.items.findIndex((b) => b.id === id);
    if (index < 0) return;
    this.items.splice(index, 1);
    this.emit('change');
  }

  removeOnPage(page) {
    const bookmark = this.items.find((b) => b.page === page);
    if (bookmark) this.remove(bookmark.id);
  }
}
