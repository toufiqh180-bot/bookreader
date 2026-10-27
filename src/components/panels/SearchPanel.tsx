/**
 * Search UI over a BookSearch. Enter / Shift+Enter step through results. The
 * first jump goes into history so Back returns to where you were reading;
 * stepping between hits doesn't flood the history.
 */
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useApp, useEmitter } from '../../hooks/use-app.ts';
import { EmptyState } from './EmptyState.tsx';
import type { Book } from '../../models/book.ts';
import type { ReaderPane } from '../../engine/reader-pane.ts';
import type { SearchResult } from '../../services/book-search.ts';

const MAX_RENDERED_RESULTS = 1000;
const INPUT_DEBOUNCE_MS = 250;

export function SearchPanel({ book, pane }: { book: Book; pane: ReaderPane }) {
  const app = useApp();
  const search = app.searchFor(book);
  useEmitter(search, 'results', 'current', 'progress');
  // Text being typed; null shows the search's own query (which may be set elsewhere,
  // e.g. "Search for this" on a selection).
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? search.query;
  const input = useRef<HTMLInputElement>(null);
  const jumped = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => {
    if (draft === null || draft === search.query) return;
    const timer = setTimeout(() => {
      jumped.current = false;
      void search.run(draft);
      setDraft(null);
    }, INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, search]);

  const goTo = (result: SearchResult | null) => {
    if (!result) return;
    const first = result.rects[0];
    const target = first ? { page: result.page, x: Math.min(first.x1, first.x2), y: Math.max(first.y1, first.y2) + 60 } : { page: result.page };
    if (jumped.current) pane.scrollTo(target);
    else pane.navigate(target);
    jumped.current = true;
    void pane.flash(result.page, result.rects);
  };

  const status = search.searching
    ? 'Searching…'
    : search.query.trim().length >= 2
      ? `${search.results.length} result${search.results.length === 1 ? '' : 's'}`
      : '';

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b bg-background p-3">
        <Input
          ref={input}
          type="search"
          placeholder="Search this book…"
          value={query}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goTo(search.step(e.shiftKey ? -1 : 1));
          }}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{status}</span>
          <label className="flex items-center gap-2">
            Match case
            <Switch
              checked={search.matchCase}
              onCheckedChange={(matchCase) => {
                jumped.current = false;
                void search.run(query, { matchCase });
              }}
            />
          </label>
        </div>
      </div>
      {!search.query.trim() ? (
        <EmptyState title="Search the whole book">Includes text recognized from scanned pages.</EmptyState>
      ) : (
        <div className="p-1.5">
          {search.results.slice(0, MAX_RENDERED_RESULTS).map((r, index, results) => {
            const firstOnPage = index === 0 || results[index - 1].page !== r.page;
            const header = firstOnPage ? (
              <div className="px-2 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground">Page {book.pageLabel(r.page)}</div>
            ) : null;
            return (
              <div key={`${r.page}-${index}`}>
                {header}
                <button
                  type="button"
                  onClick={() => goTo(search.select(index))}
                  className={`w-full rounded-md px-2 py-1.5 text-left leading-relaxed hover:bg-muted ${index === search.current ? 'bg-accent' : ''}`}
                >
                  {r.snippet.slice(0, r.matchStart)}
                  <mark className="rounded-sm bg-amber-300/60 text-inherit">{r.snippet.slice(r.matchStart, r.matchStart + r.matchLength)}</mark>
                  {r.snippet.slice(r.matchStart + r.matchLength)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
