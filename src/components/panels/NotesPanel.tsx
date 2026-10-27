/** All annotations in reading order, filterable; click one to jump to it. */
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp, useEmitter } from '../../hooks/use-app.ts';
import { ANNOTATION_LABELS, inReadingOrder } from '../../lib/export-format.ts';
import { toBox } from '../../lib/geometry.ts';
import { EmptyState } from './EmptyState.tsx';
import type { Annotation } from '../../models/types.ts';
import type { Book } from '../../models/book.ts';
import type { ReaderPane } from '../../engine/reader-pane.ts';

const FILTERS: Array<[string, string]> = [['all', 'All annotations'], ['commented', 'With comments'], ...Object.entries(ANNOTATION_LABELS)];

export function NotesPanel({ book, pane }: { book: Book; pane: ReaderPane }) {
  const app = useApp();
  useEmitter(book.annotations, 'change');
  const [filter, setFilter] = useState('all');
  const items = inReadingOrder(book.annotations.items).filter((a) => filter === 'all' || a.type === filter || (filter === 'commented' && a.comment));

  const reveal = (a: Annotation) => {
    const first = a.rects?.[0] ? toBox(a.rects[0]) : null;
    pane.navigate(first ? { page: a.page, x: first.x, y: first.y + first.h + 30 } : { page: a.page }, { flash: a.rects });
    setTimeout(() => app.editAnnotation(pane, a.id), 250);
  };

  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-background p-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger size="sm" className="w-full" aria-label="Filter annotations">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!items.length ? (
        <EmptyState title="No annotations yet">
          Select text and press <kbd>H</kbd> to highlight or <kbd>N</kbd> to add a note. The pen tools draw in the margins.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => reveal(a)}
              className="rounded-lg border bg-card p-3 text-left shadow-xs transition hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: a.color }} />
                {ANNOTATION_LABELS[a.type]}
                <span className="flex-1" />
                <span className="font-normal text-muted-foreground">p. {book.pageLabel(a.page)}</span>
              </div>
              {a.textQuoted && <p className="mt-1.5 line-clamp-4 border-l-[3px] pl-2 font-serif">{a.textQuoted}</p>}
              {a.comment && <p className="mt-1.5 whitespace-pre-wrap">{a.comment}</p>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
