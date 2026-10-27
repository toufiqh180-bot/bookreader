/** Bookmarks: jump, rename (double-click), remove. */
import { useState } from 'react';
import { Bookmark, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommand, useEmitter } from '../../hooks/use-app.ts';
import { EmptyState } from './EmptyState.tsx';
import type { Book } from '../../models/book.ts';
import type { ReaderPane } from '../../engine/reader-pane.ts';

export function BookmarksPanel({ book, pane, currentPage }: { book: Book; pane: ReaderPane; currentPage: number }) {
  useEmitter(book.bookmarks, 'change');
  const run = useCommand();
  const [renaming, setRenaming] = useState<string | null>(null);
  const has = book.bookmarks.has(currentPage);

  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-background p-3">
        <Button className="w-full" variant={has ? 'outline' : 'default'} onClick={() => run('nav.toggleBookmark')}>
          <Bookmark className={has ? 'fill-current' : ''} />
          {has ? 'Remove bookmark from' : 'Bookmark'} page {book.pageLabel(currentPage)}
        </Button>
      </div>
      {!book.bookmarks.items.length ? (
        <EmptyState title="No bookmarks yet">
          Press <kbd>⌘/Ctrl</kbd> <kbd>D</kbd> to bookmark the page you're on.
        </EmptyState>
      ) : (
        <ul className="p-1.5">
          {book.bookmarks.items.map((b) => (
            <li key={b.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Bookmark className="size-3.5 shrink-0 fill-current text-primary" />
              {renaming === b.id ? (
                <input
                  autoFocus
                  defaultValue={b.title}
                  onBlur={(e) => {
                    book.bookmarks.rename(b.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 outline-none focus:border-primary"
                />
              ) : (
                <button
                  type="button"
                  title="Double-click to rename"
                  onClick={() => pane.navigate({ page: b.page })}
                  onDoubleClick={() => setRenaming(b.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {b.title}
                </button>
              )}
              <span className="text-[11px] text-muted-foreground tabular-nums">{book.pageLabel(b.page)}</span>
              <button
                type="button"
                aria-label="Remove bookmark"
                onClick={() => book.bookmarks.remove(b.id)}
                className="grid size-5 place-items-center rounded opacity-0 group-hover:opacity-60 hover:bg-background hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
