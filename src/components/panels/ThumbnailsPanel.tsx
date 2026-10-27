/**
 * Grid of page thumbnails, rendered lazily as they scroll into view, with
 * badges for bookmarks and annotation counts. Widening the panel fits more
 * columns.
 */
import { useEffect, useRef } from 'react';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useEmitter } from '../../hooks/use-app.ts';
import type { Book } from '../../models/book.ts';
import type { ReaderPane } from '../../engine/reader-pane.ts';

const THUMB_WIDTH_PX = 160;

export function ThumbnailsPanel({ book, pane, currentPage }: { book: Book; pane: ReaderPane; currentPage: number }) {
  useEmitter(book.annotations, 'change');
  useEmitter(book.bookmarks, 'change');
  const grid = useRef<HTMLDivElement>(null);
  const counts = new Map<number, number>();
  for (const a of book.annotations.items) counts.set(a.page, (counts.get(a.page) ?? 0) + 1);

  useEffect(() => {
    grid.current?.querySelector(`[data-page="${currentPage}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  return (
    <div ref={grid} className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2.5 gap-y-4 p-3">
      {book.pageSizes.map((size, i) => {
        const page = i + 1;
        return (
          <button key={page} type="button" data-page={page} onClick={() => pane.navigate({ page })} className="group flex flex-col items-center gap-1.5">
            <Thumbnail book={book} page={page} aspect={`${size.w} / ${size.h}`} current={page === currentPage} />
            <span className={cn('flex items-center gap-1 text-[11px] text-muted-foreground', page === currentPage && 'font-semibold text-primary')}>
              {book.pageLabel(page)}
              {book.bookmarks.has(page) && <Bookmark className="size-3 fill-current text-primary" />}
              {counts.get(page) && <span className="rounded-full bg-yellow-300 px-1.5 text-[10px] text-neutral-800">{counts.get(page)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Thumbnail({ book, page, aspect, current }: { book: Book; page: number; aspect: string; current: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const pdfPage = await book.doc.getPage(page);
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: (THUMB_WIDTH_PX / base.width) * Math.min(2, devicePixelRatio || 1) });
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
        canvas.className = 'block size-full';
        await pdfPage.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise.catch(() => {});
        if (!cancelled) node.replaceChildren(canvas);
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [book, page]);
  return (
    <div
      ref={box}
      style={{ aspectRatio: aspect }}
      className={cn(
        'w-full overflow-hidden rounded-sm bg-white shadow-md outline-2 outline-offset-2 outline-transparent group-hover:outline-border',
        current && 'outline-primary group-hover:outline-primary',
      )}
    />
  );
}
