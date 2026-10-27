/** Table of contents from the PDF outline, with the current section highlighted. */
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EmptyState } from './EmptyState.tsx';
import type { Book } from '../../models/book.ts';
import type { OutlineItem } from '../../models/pdf-document.ts';
import type { ReaderPane } from '../../engine/reader-pane.ts';

const EXPANDED_DEPTH = 1; // top-level chapters start expanded

/** Resolves every outline entry's page once, so rows can show numbers and the current section. */
function useOutlinePages(book: Book): Map<OutlineItem, number> {
  const [pages, setPages] = useState(() => new Map<OutlineItem, number>());
  useEffect(() => {
    let cancelled = false;
    const result = new Map<OutlineItem, number>();
    const visit = async (items: OutlineItem[]) => {
      for (const item of items) {
        const target = item.dest ? await book.doc.resolveDestination(item.dest).catch(() => null) : null;
        if (target) result.set(item, target.page);
        if (item.items?.length) await visit(item.items);
      }
    };
    void visit(book.doc.outline).then(() => !cancelled && setPages(result));
    return () => {
      cancelled = true;
    };
  }, [book]);
  return pages;
}

export function OutlinePanel({ book, pane, currentPage }: { book: Book; pane: ReaderPane; currentPage: number }) {
  const pages = useOutlinePages(book);
  if (!book.doc.outline.length) return <EmptyState title="No table of contents">Use Pages or Bookmarks to get around this book.</EmptyState>;

  // The current section is the last entry starting on or before this page.
  let current: OutlineItem | null = null;
  for (const [item, page] of pages) if (page <= currentPage && (!current || page >= pages.get(current)!)) current = item;

  return (
    <div className="p-1.5">
      <OutlineList items={book.doc.outline} depth={0} pages={pages} current={current} book={book} pane={pane} />
    </div>
  );
}

function OutlineList({
  items,
  depth,
  ...rest
}: {
  items: OutlineItem[];
  depth: number;
  pages: Map<OutlineItem, number>;
  current: OutlineItem | null;
  book: Book;
  pane: ReaderPane;
}) {
  return items.map((item, i) => <OutlineRow key={`${depth}-${i}-${item.title}`} item={item} depth={depth} {...rest} />);
}

function OutlineRow({
  item,
  depth,
  pages,
  current,
  book,
  pane,
}: {
  item: OutlineItem;
  depth: number;
  pages: Map<OutlineItem, number>;
  current: OutlineItem | null;
  book: Book;
  pane: ReaderPane;
}) {
  const [open, setOpen] = useState(depth < EXPANDED_DEPTH);
  const hasChildren = Boolean(item.items?.length);
  const page = pages.get(item);
  return (
    <>
      <button
        type="button"
        onClick={() => (item.dest ? void pane.followDestination(item.dest) : item.url && window.open(item.url, '_blank', 'noopener'))}
        className={cn('flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left hover:bg-muted', item === current && 'bg-accent text-accent-foreground')}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <span
          role="button"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className={cn('grid size-4 shrink-0 place-items-center text-muted-foreground transition-transform', !hasChildren && 'invisible', open && 'rotate-90')}
        >
          <ChevronRight className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {page && <span className="text-[11px] text-muted-foreground tabular-nums">{book.pageLabel(page)}</span>}
      </button>
      {hasChildren && open && <OutlineList items={item.items} depth={depth + 1} pages={pages} current={current} book={book} pane={pane} />}
    </>
  );
}
