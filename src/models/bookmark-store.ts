/** Owns a book's bookmarks, kept sorted by page. Emits `change`. */
import { Emitter, nowIso, uid } from '../lib/util.ts';
import type { Bookmark } from './types.ts';

export class BookmarkStore extends Emitter<{ change: [] }> {
  readonly items: Bookmark[];

  /** @param bookmarks mutated in place — it is the persisted array */
  constructor(bookmarks: Bookmark[]) {
    super();
    this.items = bookmarks;
  }

  has(page: number): boolean {
    return this.items.some((b) => b.page === page);
  }

  add(page: number, title: string): Bookmark {
    const bookmark = { id: uid('bmk'), page, title, createdAt: nowIso() };
    this.items.push(bookmark);
    this.items.sort((a, b) => a.page - b.page);
    this.emit('change');
    return bookmark;
  }

  rename(id: string, title: string): void {
    const bookmark = this.items.find((b) => b.id === id);
    if (!bookmark || !title.trim()) return;
    bookmark.title = title.trim();
    this.emit('change');
  }

  remove(id: string): void {
    const index = this.items.findIndex((b) => b.id === id);
    if (index < 0) return;
    this.items.splice(index, 1);
    this.emit('change');
  }

  removeOnPage(page: number): void {
    const bookmark = this.items.find((b) => b.page === page);
    if (bookmark) this.remove(bookmark.id);
  }
}
